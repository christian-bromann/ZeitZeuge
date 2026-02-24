import type {
  TraceResult,
  ScreencastFrame,
  RenderingDiagnostic,
  FCPCorrelation,
  RenderingPhase,
  FCPBottleneck,
  TraceEvent,
} from '@zeitzeuge/utils';
import { detectVisualChanges, buildFilmstrip, approximateSpeedIndex } from './screencast.js';

/**
 * Build a complete rendering diagnostic from trace data and screencast frames.
 *
 * Correlates FCP timing with network activity, main-thread blocking, and
 * visual progress to identify the bottlenecks delaying first contentful paint.
 */
export function buildRenderingDiagnostic(
  traceResult: TraceResult,
  frames: ScreencastFrame[],
): RenderingDiagnostic {
  const { metrics, runtimeTrace, rawTraceEvents } = traceResult;
  const fcpTs = metrics.firstContentfulPaint;

  const visualChanges = detectVisualChanges(frames);
  const filmstrip = buildFilmstrip(frames, visualChanges);
  const speedIndex = approximateSpeedIndex(visualChanges);

  const fcpCorrelation = buildFCPCorrelation(traceResult, frames, fcpTs);
  const renderingPhases = buildRenderingPhases(
    metrics,
    rawTraceEvents ?? [],
    runtimeTrace?.mainThreadId ?? 0,
  );
  const fcpBottlenecks = identifyFCPBottlenecks(fcpCorrelation, traceResult);

  return {
    filmstrip,
    visualChanges,
    fcpCorrelation,
    renderingPhases,
    speedIndex,
    fcpBottlenecks,
  };
}

/**
 * Correlate FCP with network and main-thread activity to understand what
 * had to happen before the browser could paint contentful pixels.
 */
function buildFCPCorrelation(
  traceResult: TraceResult,
  frames: ScreencastFrame[],
  fcpTs: number,
): FCPCorrelation {
  const { networkRequests, runtimeTrace } = traceResult;

  // Find nearest screencast frame to FCP
  let nearestFrameIndex = 0;
  let minDelta = Infinity;
  for (let i = 0; i < frames.length; i++) {
    const delta = Math.abs(frames[i]!.timestamp - fcpTs);
    if (delta < minDelta) {
      minDelta = delta;
      nearestFrameIndex = i;
    }
  }

  const resourcesLoadedBeforeFCP = networkRequests
    .filter((r) => r.endTime > 0 && r.endTime <= fcpTs)
    .sort((a, b) => a.endTime - b.endTime)
    .map((r) => ({
      url: r.url,
      resourceType: r.resourceType,
      duration: Math.round(r.duration),
      isRenderBlocking: r.isRenderBlocking,
      endTime: Math.round(r.endTime),
    }));

  const resourcesLoadingAtFCP = networkRequests
    .filter((r) => r.startTime <= fcpTs && (r.endTime === 0 || r.endTime > fcpTs))
    .map((r) => ({
      url: r.url,
      resourceType: r.resourceType,
      startTime: Math.round(r.startTime),
    }));

  const renderBlockingChain = networkRequests
    .filter((r) => r.isRenderBlocking && r.endTime > 0 && r.endTime <= fcpTs)
    .sort((a, b) => a.startTime - b.startTime)
    .map((r) => ({
      url: r.url,
      resourceType: r.resourceType,
      duration: Math.round(r.duration),
      size: r.decodedSize,
    }));

  const mainThreadBlockersBeforeFCP = (runtimeTrace?.blockingFunctions ?? [])
    .filter((bf) => bf.startTime + bf.duration <= fcpTs)
    .map((bf) => ({
      functionName: bf.functionName,
      scriptUrl: bf.scriptUrl,
      duration: Math.round(bf.duration),
      startTime: Math.round(bf.startTime),
    }));

  const totalBlockingTimeBeforeFCP = mainThreadBlockersBeforeFCP.reduce(
    (sum, bf) => sum + Math.max(0, bf.duration - 50),
    0,
  );

  const layoutTimeBeforeFCP = computeLayoutTimeBeforeFCP(traceResult, fcpTs);

  return {
    fcpTimestamp: Math.round(fcpTs),
    nearestFrameIndex,
    resourcesLoadedBeforeFCP,
    resourcesLoadingAtFCP,
    renderBlockingChain,
    mainThreadBlockersBeforeFCP,
    totalBlockingTimeBeforeFCP: Math.round(totalBlockingTimeBeforeFCP),
    layoutTimeBeforeFCP: Math.round(layoutTimeBeforeFCP),
  };
}

/**
 * Compute total time spent in layout/style recalculation before FCP
 * by scanning raw trace events.
 */
function computeLayoutTimeBeforeFCP(traceResult: TraceResult, fcpTs: number): number {
  const { rawTraceEvents, runtimeTrace } = traceResult;
  if (!rawTraceEvents || rawTraceEvents.length === 0) return 0;

  const mainTid = runtimeTrace?.mainThreadId ?? 0;
  const navEvent = rawTraceEvents.find(
    (e) => e.name === 'navigationStart' || e.name === 'NavigationStart',
  );
  const navTs = navEvent?.ts ?? rawTraceEvents[0]?.ts ?? 0;
  const fcpUs = fcpTs * 1000 + navTs;

  const layoutEvents = new Set(['Layout', 'UpdateLayoutTree', 'RecalculateStyles']);
  let layoutTime = 0;

  for (const e of rawTraceEvents) {
    if (e.tid !== mainTid || e.ph !== 'X' || !e.dur) continue;
    if (!layoutEvents.has(e.name)) continue;
    if (e.ts + e.dur <= fcpUs) {
      layoutTime += e.dur / 1000;
    }
  }

  return layoutTime;
}

/**
 * Break the page load into named rendering phases to help understand
 * where time is spent between navigation and load complete.
 */
function buildRenderingPhases(
  metrics: TraceResult['metrics'],
  rawTraceEvents: TraceEvent[],
  mainThreadId: number,
): RenderingPhase[] {
  const phases: RenderingPhase[] = [];
  const fp = metrics.firstPaint;
  const fcp = metrics.firstContentfulPaint;
  const dcl = metrics.domContentLoaded;
  const load = metrics.loadComplete;

  if (fp > 0) {
    phases.push({
      name: 'Server & Network',
      startTime: 0,
      endTime: Math.round(fp),
      duration: Math.round(fp),
      description:
        'Time from navigation start to first paint — includes DNS, TCP, TLS, server response, and HTML parsing.',
    });
  }

  if (fcp > fp && fp > 0) {
    phases.push({
      name: 'First Paint to FCP',
      startTime: Math.round(fp),
      endTime: Math.round(fcp),
      duration: Math.round(fcp - fp),
      description:
        'Time between first paint (background/border) and first contentful paint (text/image). Render-blocking resources and large DOM delay this phase.',
    });
  } else if (fcp > 0) {
    phases.push({
      name: 'Navigation to FCP',
      startTime: 0,
      endTime: Math.round(fcp),
      duration: Math.round(fcp),
      description:
        'Time from navigation start to first contentful paint. Includes all network, parsing, and rendering work.',
    });
  }

  if (dcl > fcp && fcp > 0) {
    phases.push({
      name: 'FCP to DOMContentLoaded',
      startTime: Math.round(fcp),
      endTime: Math.round(dcl),
      duration: Math.round(dcl - fcp),
      description:
        'Time between FCP and DOMContentLoaded. Deferred scripts execute during this phase.',
    });
  }

  if (load > dcl && dcl > 0) {
    phases.push({
      name: 'DOMContentLoaded to Load',
      startTime: Math.round(dcl),
      endTime: Math.round(load),
      duration: Math.round(load - dcl),
      description:
        'Time between DOMContentLoaded and load event. Images, fonts, and async resources finish loading.',
    });
  }

  // Annotate phases with main-thread activity breakdown
  if (rawTraceEvents.length > 0) {
    annotatePhaseActivity(phases, rawTraceEvents, mainThreadId);
  }

  return phases;
}

/**
 * Annotate rendering phases with a summary of main-thread activity
 * (scripting vs layout vs painting) that occurred during each phase.
 */
function annotatePhaseActivity(
  phases: RenderingPhase[],
  rawTraceEvents: TraceEvent[],
  mainThreadId: number,
): void {
  const navEvent = rawTraceEvents.find(
    (e) => e.name === 'navigationStart' || e.name === 'NavigationStart',
  );
  const navTs = navEvent?.ts ?? rawTraceEvents[0]?.ts ?? 0;

  const scriptingEvents = new Set([
    'FunctionCall',
    'EvaluateScript',
    'TimerFire',
    'RequestAnimationFrame',
  ]);
  const layoutEvts = new Set(['Layout', 'UpdateLayoutTree', 'RecalculateStyles']);

  for (const phase of phases) {
    const startUs = phase.startTime * 1000 + navTs;
    const endUs = phase.endTime * 1000 + navTs;

    let scripting = 0;
    let layout = 0;
    let painting = 0;

    for (const e of rawTraceEvents) {
      if (e.tid !== mainThreadId || e.ph !== 'X' || !e.dur) continue;
      if (e.ts >= endUs || e.ts + e.dur <= startUs) continue;

      const overlapStart = Math.max(e.ts, startUs);
      const overlapEnd = Math.min(e.ts + e.dur, endUs);
      const overlapMs = (overlapEnd - overlapStart) / 1000;

      if (scriptingEvents.has(e.name)) scripting += overlapMs;
      else if (layoutEvts.has(e.name)) layout += overlapMs;
      else if (e.name === 'Paint' || e.name === 'CompositeLayers') painting += overlapMs;
    }

    if (scripting > 0 || layout > 0 || painting > 0) {
      const parts: string[] = [];
      if (scripting > 0) parts.push(`${Math.round(scripting)}ms scripting`);
      if (layout > 0) parts.push(`${Math.round(layout)}ms layout`);
      if (painting > 0) parts.push(`${Math.round(painting)}ms painting`);
      phase.description += ` Main-thread breakdown: ${parts.join(', ')}.`;
    }
  }
}

/**
 * Identify the specific bottlenecks delaying FCP based on the correlation data.
 * Returns actionable bottleneck entries sorted by estimated delay (largest first).
 */
function identifyFCPBottlenecks(
  correlation: FCPCorrelation,
  traceResult: TraceResult,
): FCPBottleneck[] {
  const bottlenecks: FCPBottleneck[] = [];

  for (const rb of correlation.renderBlockingChain) {
    bottlenecks.push({
      type: 'render-blocking-resource',
      description: `Render-blocking ${rb.resourceType.toLowerCase()} (${formatSize(rb.size)}) delayed FCP by ~${rb.duration}ms. Consider async/defer loading or inlining critical content.`,
      estimatedDelayMs: rb.duration,
      source: rb.url,
    });
  }

  for (const bf of correlation.mainThreadBlockersBeforeFCP) {
    if (bf.duration >= 50) {
      bottlenecks.push({
        type: 'long-task-before-fcp',
        description: `Long task "${bf.functionName}" blocked the main thread for ${bf.duration}ms before FCP. This prevents the browser from rendering content.`,
        estimatedDelayMs: bf.duration - 50,
        source: bf.scriptUrl || bf.functionName,
      });
    }
  }

  // Detect slow server response (TTFB > 600ms)
  const docRequest = traceResult.networkRequests.find((r) => r.resourceType === 'Document');
  if (docRequest && docRequest.duration > 600) {
    bottlenecks.push({
      type: 'slow-server-response',
      description: `Server took ${Math.round(docRequest.duration)}ms to respond with the HTML document. Consider server-side caching, CDN, or SSR optimization.`,
      estimatedDelayMs: Math.round(docRequest.duration - 200),
      source: docRequest.url,
    });
  }

  // Detect sequential resource chains
  const renderBlockingRequests = traceResult.networkRequests
    .filter((r) => r.isRenderBlocking)
    .sort((a, b) => a.startTime - b.startTime);

  for (let i = 1; i < renderBlockingRequests.length; i++) {
    const prev = renderBlockingRequests[i - 1]!;
    const curr = renderBlockingRequests[i]!;
    const gap = curr.startTime - prev.endTime;
    if (gap < 50 && prev.endTime > 0 && curr.startTime > prev.endTime - 10) {
      const chainDelay = curr.endTime - prev.startTime;
      const parallelTime = Math.max(prev.duration, curr.duration);
      const savings = chainDelay - parallelTime;
      if (savings > 50) {
        bottlenecks.push({
          type: 'sequential-resource-chain',
          description: `Sequential render-blocking chain: "${basename(prev.url)}" → "${basename(curr.url)}" adds ~${Math.round(savings)}ms. Preloading or parallelizing would reduce FCP.`,
          estimatedDelayMs: Math.round(savings),
          source: curr.url,
        });
      }
    }
  }

  if (correlation.layoutTimeBeforeFCP > 100) {
    bottlenecks.push({
      type: 'excessive-layout',
      description: `${Math.round(correlation.layoutTimeBeforeFCP)}ms spent in layout/style recalculation before FCP. Reduce CSS complexity or DOM size for the initial render.`,
      estimatedDelayMs: Math.round(correlation.layoutTimeBeforeFCP * 0.5),
      source: 'layout/style-recalculation',
    });
  }

  bottlenecks.sort((a, b) => b.estimatedDelayMs - a.estimatedDelayMs);
  return bottlenecks;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes}B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
}

function basename(url: string): string {
  try {
    return new URL(url).pathname.split('/').pop() || url;
  } catch {
    return url;
  }
}
