import type {
  TraceEvent,
  TraceResult,
  NetworkRequest,
  PageMetrics,
  LongTask,
  TraceHandle,
  CaptureOptions,
  RuntimeTraceSummary,
  ScreencastFrame,
} from '@zeitzeuge/utils';
import { parseRuntimeTrace } from './runtime-trace.js';
import { startScreencast, type ScreencastHandle } from './screencast.js';
import { buildRenderingDiagnostic } from './fcp-analysis.js';

/**
 * Text-based resource types whose response bodies we capture.
 */
const TEXT_RESOURCE_TYPES = new Set(['Script', 'Stylesheet', 'Document', 'XHR', 'Fetch']);

/**
 * Maximum response body size we'll capture (2 MB).
 */
const MAX_BODY_SIZE = 2 * 1024 * 1024;

/**
 * Chrome trace categories to capture for runtime analysis.
 */
const TRACE_CATEGORIES = [
  'devtools.timeline',
  'disabled-by-default-devtools.timeline',
  'disabled-by-default-devtools.timeline.stack',
  'v8.execute',
  'blink.user_timing',
  'disabled-by-default-v8.gc',
];

/**
 * Maximum time to wait for Tracing.tracingComplete after Tracing.end (ms).
 */
const TRACING_COMPLETE_TIMEOUT = 10_000;

/**
 * Start tracing page load on a CDP session.
 * Call this BEFORE navigation so it captures everything from the start.
 * Returns a TraceHandle — call `stop()` after the page has loaded and settled.
 */
export async function tracePageLoad(
  cdpSession: any,
  _options: CaptureOptions = {},
): Promise<TraceHandle> {
  const requests = new Map<string, Partial<NetworkRequest>>();
  const finishedIds = new Set<string>();
  const enableScreencast = _options.screencast !== false;

  // ── Chrome Tracing domain (runtime trace) ──
  const traceEvents: TraceEvent[] = [];
  let tracingStarted = false;

  try {
    // Register listener BEFORE starting to capture all events
    cdpSession.on('Tracing.dataCollected', (params: any) => {
      if (params.value && Array.isArray(params.value)) {
        traceEvents.push(...params.value);
      }
    });

    await cdpSession.send('Tracing.start', {
      traceConfig: {
        includedCategories: TRACE_CATEGORIES,
        recordMode: 'recordUntilFull',
      },
      transferMode: 'ReportEvents',
    });
    tracingStarted = true;
  } catch {
    // Tracing not supported on this Chrome version — continue without it
  }

  // ── Screencast capture (rendering diagnostics) ──
  let screencastHandle: ScreencastHandle | undefined;
  const navigationStartMs = Date.now();

  if (enableScreencast) {
    try {
      screencastHandle = await startScreencast(cdpSession, navigationStartMs);
    } catch {
      // Screencast not supported — continue without it
    }
  }

  // ── Network domain ──
  await cdpSession.send('Network.enable');

  // Listen for network requests
  cdpSession.on('Network.requestWillBeSent', (params: any) => {
    requests.set(params.requestId, {
      requestId: params.requestId,
      url: params.request.url,
      method: params.request.method,
      startTime: params.timestamp * 1000,
      initiator: params.initiator?.type ?? 'other',
      resourceType: params.type ?? 'Other',
    });
  });

  cdpSession.on('Network.responseReceived', (params: any) => {
    const req = requests.get(params.requestId);
    if (req) {
      req.status = params.response.status;
      req.mimeType = params.response.mimeType;
      req.encodedSize = params.response.encodedDataLength ?? 0;
      req.priority = params.response.priority ?? 'Medium';
      req.isRenderBlocking = params.response.renderBlocking === 'blocking';
      req.resourceType = params.type ?? req.resourceType ?? 'Other';
    }
  });

  cdpSession.on('Network.loadingFinished', (params: any) => {
    const req = requests.get(params.requestId);
    if (req) {
      req.endTime = params.timestamp * 1000;
      req.duration = (req.endTime ?? 0) - (req.startTime ?? 0);
      req.decodedSize = params.encodedDataLength ?? 0;
      finishedIds.add(params.requestId);
    }
  });

  // Inject PerformanceObserver for long tasks BEFORE navigation
  await cdpSession.send('Page.enable');
  await cdpSession.send('Page.addScriptToEvaluateOnNewDocument', {
    source: `
      window.__zeitzeuge_longTasks = [];
      new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) {
          window.__zeitzeuge_longTasks.push({
            startTime: entry.startTime,
            duration: entry.duration,
            scriptUrl: null,
          });
        }
      }).observe({ type: "longtask", buffered: true });
    `,
  });

  return {
    async stop(): Promise<TraceResult> {
      // ── Stop Chrome Tracing and collect events ──
      let runtimeTrace: RuntimeTraceSummary | undefined;

      if (tracingStarted) {
        try {
          const tracingComplete = new Promise<void>((resolve) => {
            cdpSession.on('Tracing.tracingComplete', () => resolve());
          });
          await cdpSession.send('Tracing.end');

          // Wait for tracingComplete with timeout safety
          await Promise.race([
            tracingComplete,
            new Promise<void>((resolve) => setTimeout(resolve, TRACING_COMPLETE_TIMEOUT)),
          ]);
        } catch {
          // Tracing.end failed — proceed with events collected so far
        }

        // Parse trace events into structured summary
        if (traceEvents.length > 0) {
          // Find navigation start from trace events (or use 0)
          const navEvent = traceEvents.find(
            (e) => e.name === 'navigationStart' || e.name === 'NavigationStart',
          );
          const navigationStartTs = navEvent?.ts ?? traceEvents[0]?.ts ?? 0;

          runtimeTrace = parseRuntimeTrace(traceEvents, navigationStartTs);
        }
      }

      // ── Capture response bodies for text-based resources ──
      const networkRequests: NetworkRequest[] = [];

      for (const [id, req] of requests) {
        let responseBody: string | null = null;

        if (finishedIds.has(id) && TEXT_RESOURCE_TYPES.has(req.resourceType ?? '')) {
          try {
            const bodyResult = await cdpSession.send('Network.getResponseBody', { requestId: id });
            responseBody = bodyResult.body;
            // Skip overly large bodies
            if (responseBody && responseBody.length > MAX_BODY_SIZE) {
              responseBody = null;
            }
          } catch {
            // Body may not be available (streaming, cancelled, etc.)
          }
        }

        networkRequests.push({
          requestId: req.requestId ?? id,
          url: req.url ?? '',
          method: req.method ?? 'GET',
          resourceType: req.resourceType ?? 'Other',
          mimeType: req.mimeType ?? '',
          status: req.status ?? 0,
          encodedSize: req.encodedSize ?? 0,
          decodedSize: req.decodedSize ?? 0,
          startTime: req.startTime ?? 0,
          endTime: req.endTime ?? 0,
          duration: req.duration ?? 0,
          isRenderBlocking: req.isRenderBlocking ?? false,
          responseBody,
          priority: req.priority ?? 'Medium',
          initiator: req.initiator ?? 'other',
        });
      }

      // Collect long tasks from the page
      let longTasks: LongTask[] = [];
      try {
        const longTaskResult = await cdpSession.send('Runtime.evaluate', {
          expression: 'JSON.stringify(window.__zeitzeuge_longTasks || [])',
        });
        longTasks = JSON.parse(longTaskResult.result.value || '[]');
      } catch {
        // Page may have navigated away or context destroyed
      }

      // Collect page timing metrics
      let perfMetrics: any = {};
      try {
        const metricsResult = await cdpSession.send('Runtime.evaluate', {
          expression: `JSON.stringify({
            navigationStart: performance.timing.navigationStart,
            domContentLoaded: performance.timing.domContentLoadedEventEnd - performance.timing.navigationStart,
            loadComplete: performance.timing.loadEventEnd - performance.timing.navigationStart,
          })`,
        });
        perfMetrics = JSON.parse(metricsResult.result.value || '{}');
      } catch {
        // Fallback to defaults
      }

      // Collect paint timing
      let paintEntries: any[] = [];
      try {
        const paintResult = await cdpSession.send('Runtime.evaluate', {
          expression: `JSON.stringify(
            performance.getEntriesByType("paint").map(e => ({ name: e.name, startTime: e.startTime }))
          )`,
        });
        paintEntries = JSON.parse(paintResult.result.value || '[]');
      } catch {
        // Fallback to defaults
      }

      const fp = paintEntries.find((e: any) => e.name === 'first-paint');
      const fcp = paintEntries.find((e: any) => e.name === 'first-contentful-paint');

      // ── Stop screencast and build rendering diagnostic ──
      let screencastFrames: ScreencastFrame[] = [];
      if (screencastHandle) {
        try {
          screencastFrames = await screencastHandle.stop();
        } catch {
          // Non-fatal
        }
      }

      // Disable Network domain
      await cdpSession.send('Network.disable');

      const metrics: PageMetrics = {
        navigationStart: perfMetrics.navigationStart ?? 0,
        domContentLoaded: perfMetrics.domContentLoaded ?? 0,
        loadComplete: perfMetrics.loadComplete ?? 0,
        firstPaint: fp?.startTime ?? 0,
        firstContentfulPaint: fcp?.startTime ?? 0,
        largestContentfulPaint: 0,
        totalBlockingTime: longTasks.reduce(
          (sum: number, t: LongTask) => sum + Math.max(0, t.duration - 50),
          0,
        ),
        longTasks,
      };

      const traceResult: TraceResult = {
        networkRequests,
        metrics,
        runtimeTrace,
        rawTraceEvents: tracingStarted ? traceEvents : undefined,
      };

      // Build rendering diagnostic if we have screencast frames
      if (screencastFrames.length > 0) {
        try {
          traceResult.renderingDiagnostic = buildRenderingDiagnostic(traceResult, screencastFrames);
        } catch {
          // Rendering diagnostic is best-effort
        }
      }

      return traceResult;
    },
  };
}
