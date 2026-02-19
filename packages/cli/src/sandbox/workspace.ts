import type { BackendProtocol } from 'deepagents';

import {
  createWorkspaceFromFiles,
  DATA_SCRIPTING_SKILL_FILES,
  BROWSER_ANALYSIS_SKILL_FILES,
  type HeapSummary,
  type TraceResult,
  type NetworkRequest,
} from '@zeitzeuge/utils';

export interface WorkspaceOptions {
  heapSummary: HeapSummary;
  traceResult: TraceResult;
  url: string;
  /** Maximum total size of stored asset content in bytes. Default: 10 MB */
  maxAssetSize?: number;
}

export interface WorkspaceResult {
  /** Backend for use with createDeepAgent */
  backend: BackendProtocol;
  /** Clean up sandbox resources when done */
  cleanup: () => Promise<void>;
  /** All workspace file paths, for file list injection */
  files: string[];
}

/**
 * Create a workspace populated with heap snapshot data, trace data,
 * and actual network asset content.
 *
 * Uses the shared createWorkspaceFromFiles utility backed by VfsSandbox,
 * which stores files in an in-memory VFS so the agent's absolute paths
 * (e.g. /heap/summary.json) resolve within the sandbox.
 */
export async function createWorkspace(options: WorkspaceOptions): Promise<WorkspaceResult> {
  const { heapSummary, traceResult, url, maxAssetSize = 10 * 1024 * 1024 } = options;

  const files: Record<string, string> = {};

  // ── Heap data ──
  files['/heap/summary.json'] = JSON.stringify(heapSummary, null, 2);

  // ── Trace summary ──
  files['/trace/summary.json'] = JSON.stringify(
    {
      url,
      timing: traceResult.metrics,
      requestCount: traceResult.networkRequests.length,
      totalTransferSize: traceResult.networkRequests.reduce((s, r) => s + r.encodedSize, 0),
      totalDecodedSize: traceResult.networkRequests.reduce((s, r) => s + r.decodedSize, 0),
      renderBlockingResources: traceResult.networkRequests
        .filter((r) => r.isRenderBlocking)
        .map((r) => ({
          url: r.url,
          type: r.resourceType,
          size: r.decodedSize,
          duration: r.duration,
          path: r.responseBody ? getAssetPath(r) : null,
        })),
      longTasks: traceResult.metrics.longTasks,
      resourceBreakdown: buildResourceBreakdown(traceResult.networkRequests),
    },
    null,
    2,
  );

  // ── Network waterfall ──
  files['/trace/network-waterfall.json'] = JSON.stringify(
    traceResult.networkRequests
      .sort((a, b) => a.startTime - b.startTime)
      .map((r) => ({
        url: r.url,
        type: r.resourceType,
        status: r.status,
        size: r.decodedSize,
        startTime: Math.round(r.startTime),
        endTime: Math.round(r.endTime),
        duration: Math.round(r.duration),
        isRenderBlocking: r.isRenderBlocking,
        priority: r.priority,
        path: r.responseBody ? getAssetPath(r) : null,
      })),
    null,
    2,
  );

  // ── Network assets (actual content) ──
  let totalStored = 0;
  for (const req of traceResult.networkRequests) {
    if (!req.responseBody) continue;
    if (totalStored + req.responseBody.length > maxAssetSize) continue;
    files[getAssetPath(req)] = req.responseBody;
    totalStored += req.responseBody.length;
  }

  // ── Asset manifest ──
  files['/trace/asset-manifest.json'] = JSON.stringify(
    traceResult.networkRequests.map((r) => ({
      url: r.url,
      type: r.resourceType,
      size: r.decodedSize,
      duration: r.duration,
      isRenderBlocking: r.isRenderBlocking,
      stored: !!r.responseBody,
      path: r.responseBody ? getAssetPath(r) : null,
    })),
    null,
    2,
  );

  // ── Runtime trace data (from Chrome Tracing domain) ──
  if (traceResult.runtimeTrace) {
    const rt = traceResult.runtimeTrace;

    files['/trace/runtime/summary.json'] = JSON.stringify(
      {
        totalEvents: rt.totalEvents,
        traceDuration: rt.traceDuration,
        mainThreadId: rt.mainThreadId,
        frameBreakdown: rt.frameBreakdown,
        blockingFunctionCount: rt.blockingFunctions.length,
        listenerImbalances: rt.eventListeners.filter((l) => l.activeCount > l.removeCount + 10)
          .length,
        gcPauseCount: rt.gcEvents.length,
        gcTotalDuration: rt.gcEvents.reduce((s, e) => s + e.duration, 0),
        frequentEventTypes: rt.frequentEvents.map((e) => e.eventType),
      },
      null,
      2,
    );

    files['/trace/runtime/blocking-functions.json'] = JSON.stringify(
      rt.blockingFunctions.slice(0, 50),
      null,
      2,
    );

    files['/trace/runtime/event-listeners.json'] = JSON.stringify(
      rt.eventListeners.filter((l) => l.addCount > 0),
      null,
      2,
    );

    files['/trace/runtime/frame-breakdown.json'] = JSON.stringify(rt.frameBreakdown, null, 2);
  }

  // ── Raw trace events (from Chrome Tracing domain) ──
  if (traceResult.rawTraceEvents && traceResult.rawTraceEvents.length > 0) {
    const rawJson = JSON.stringify(traceResult.rawTraceEvents);
    if (rawJson.length < 5 * 1024 * 1024) {
      files['/trace/runtime/raw-events.json'] = rawJson;
    } else {
      const mainTid = traceResult.runtimeTrace?.mainThreadId;
      const filtered = traceResult.rawTraceEvents.filter(
        (e) => e.tid === mainTid && e.dur && e.dur > 0,
      );
      const filteredJson = JSON.stringify(filtered);
      if (filteredJson.length < 5 * 1024 * 1024) {
        files['/trace/runtime/raw-events.json'] = filteredJson;
      } else {
        const important = filtered.filter((e) => (e.dur ?? 0) > 1000);
        files['/trace/runtime/raw-events.json'] = JSON.stringify(important);
      }
    }
  }

  // ── Skill files ──
  Object.assign(files, DATA_SCRIPTING_SKILL_FILES);
  Object.assign(files, BROWSER_ANALYSIS_SKILL_FILES);

  // ── Use shared workspace builder ──
  const result = await createWorkspaceFromFiles(files);

  return {
    backend: result.backend,
    cleanup: result.cleanup,
    files: Object.keys(files),
  };
}

/**
 * Map a network request to its workspace path based on resource type.
 */
export function getAssetPath(req: NetworkRequest): string {
  let filename: string;
  try {
    const pathname = new URL(req.url).pathname;
    filename = pathname.split('/').pop() || 'index';
  } catch {
    filename = 'unknown';
  }

  switch (req.resourceType) {
    case 'Script':
      return `/scripts/${filename}`;
    case 'Stylesheet':
      return `/styles/${filename}`;
    case 'Font':
      return `/fonts/${filename}`;
    case 'Document':
      return `/html/${filename}`;
    default:
      return `/other/${filename}`;
  }
}

function buildResourceBreakdown(requests: NetworkRequest[]) {
  const groups: Record<string, { count: number; totalSize: number }> = {
    scripts: { count: 0, totalSize: 0 },
    stylesheets: { count: 0, totalSize: 0 },
    fonts: { count: 0, totalSize: 0 },
    images: { count: 0, totalSize: 0 },
    other: { count: 0, totalSize: 0 },
  };
  for (const r of requests) {
    const key =
      r.resourceType === 'Script'
        ? 'scripts'
        : r.resourceType === 'Stylesheet'
          ? 'stylesheets'
          : r.resourceType === 'Font'
            ? 'fonts'
            : r.resourceType === 'Image'
              ? 'images'
              : 'other';
    groups[key]!.count++;
    groups[key]!.totalSize += r.decodedSize;
  }
  return groups;
}
