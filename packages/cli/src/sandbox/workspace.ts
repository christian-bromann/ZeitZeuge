import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { FilesystemBackend, type BackendProtocol } from 'deepagents';

import type { HeapSummary, TraceResult, NetworkRequest } from '@zeitzeuge/utils';

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
  /** Clean up the temporary directory when done */
  cleanup: () => void;
}

/**
 * Create a workspace populated with heap snapshot data, trace data,
 * and actual network asset content.
 *
 * Uses FilesystemBackend with virtualMode so the agent's absolute paths
 * (e.g. /heap/summary.json) map to files inside the temp directory.
 * This avoids the VfsSandbox shell-command path issues where absolute
 * paths resolve against the real filesystem instead of the workspace.
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
      rt.blockingFunctions.slice(0, 50), // Top 50 by duration
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
  // Store the actual raw events so the agent can investigate specific traces.
  // Capped at 5MB to avoid oversized workspace.
  if (traceResult.rawTraceEvents && traceResult.rawTraceEvents.length > 0) {
    const rawJson = JSON.stringify(traceResult.rawTraceEvents);
    if (rawJson.length < 5 * 1024 * 1024) {
      files['/trace/runtime/raw-events.json'] = rawJson;
    } else {
      // Too large — store a filtered subset: only main-thread events with dur > 0
      const mainTid = traceResult.runtimeTrace?.mainThreadId;
      const filtered = traceResult.rawTraceEvents.filter(
        (e) => e.tid === mainTid && e.dur && e.dur > 0,
      );
      const filteredJson = JSON.stringify(filtered);
      if (filteredJson.length < 5 * 1024 * 1024) {
        files['/trace/runtime/raw-events.json'] = filteredJson;
      } else {
        // Still too large — store only events > 1ms on the main thread
        const important = filtered.filter((e) => (e.dur ?? 0) > 1000);
        files['/trace/runtime/raw-events.json'] = JSON.stringify(important);
      }
    }
  }

  // ── Write all files to a temp directory ──
  const tempDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-workspace-'));

  for (const [filePath, content] of Object.entries(files)) {
    // Strip leading / to get a relative path for the real filesystem
    const relPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = join(tempDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  const backend = new FilesystemBackend({
    rootDir: tempDir,
    virtualMode: true,
  });

  const cleanup = () => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { backend, cleanup };
}

/**
 * Map a network request to its workspace path based on resource type.
 *
 * Returns virtual absolute paths (e.g. /scripts/app.js) that the
 * FilesystemBackend with virtualMode maps to the temp directory.
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
