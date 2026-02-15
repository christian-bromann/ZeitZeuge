import type {
  TraceEvent,
  BlockingFunction,
  EventListenerInfo,
  FrameBreakdown,
  GCEvent,
  RuntimeTraceSummary,
} from '@zeitzeuge/utils';

/**
 * Trace event names categorised by the type of work they represent.
 */
const SCRIPTING_EVENTS = new Set([
  'FunctionCall',
  'EvaluateScript',
  'TimerFire',
  'RequestAnimationFrame',
  'FireAnimationFrame',
]);
const LAYOUT_EVENTS = new Set(['Layout', 'UpdateLayoutTree', 'RecalculateStyles']);
const PAINTING_EVENTS = new Set(['Paint', 'CompositeLayers', 'RasterTask']);
const GC_EVENT_NAMES = new Set(['MajorGC', 'MinorGC']);

/**
 * Blocking function events — those we check for > 50ms threshold.
 */
const BLOCKING_EVENT_NAMES = new Set(['FunctionCall', 'EvaluateScript']);

/**
 * Minimum duration in microseconds to qualify as a "blocking" function call (50ms).
 */
const BLOCKING_THRESHOLD_US = 50_000;

// ── Public API ─────────────────────────────────────────────────

/**
 * Parse raw Chrome trace events into a structured RuntimeTraceSummary.
 *
 * @param traceEvents - Array of Chrome trace events from Tracing.dataCollected
 * @param navigationStartTs - Navigation start timestamp in microseconds (from trace)
 */
export function parseRuntimeTrace(
  traceEvents: TraceEvent[],
  navigationStartTs: number,
): RuntimeTraceSummary {
  if (traceEvents.length === 0) {
    return emptyRuntimeTrace();
  }

  const mainThreadId = findMainThread(traceEvents);
  const mainEvents = traceEvents.filter((e) => e.tid === mainThreadId);

  const blockingFunctions = extractBlockingFunctions(mainEvents, navigationStartTs);
  const eventListeners = extractEventListenerInfo(mainEvents);
  const frameBreakdown = buildFrameBreakdown(mainEvents);
  const gcEvents = extractGCEvents(mainEvents, navigationStartTs);
  const frequentEvents = findFrequentEvents(mainEvents);

  // Compute trace duration from first to last event
  let minTs = Infinity;
  let maxTs = -Infinity;
  for (const e of traceEvents) {
    if (e.ts < minTs) minTs = e.ts;
    const endTs = e.ts + (e.dur ?? 0);
    if (endTs > maxTs) maxTs = endTs;
  }
  const traceDuration = (maxTs - minTs) / 1000; // μs → ms

  return {
    totalEvents: traceEvents.length,
    mainThreadId,
    traceDuration,
    frameBreakdown,
    blockingFunctions,
    eventListeners,
    gcEvents,
    frequentEvents,
  };
}

/**
 * Identify the main renderer thread (CrRendererMain).
 *
 * Strategy:
 * 1. Look for __metadata thread_name event with args.name === "CrRendererMain"
 * 2. Fallback: thread with the most FunctionCall events
 * 3. Return 0 if no events
 */
export function findMainThread(events: TraceEvent[]): number {
  // Strategy 1: metadata
  const metadata = events.find(
    (e) => e.cat === '__metadata' && e.name === 'thread_name' && e.args?.name === 'CrRendererMain',
  );
  if (metadata) return metadata.tid;

  // Strategy 2: most FunctionCall events
  const threadCounts = new Map<number, number>();
  for (const e of events) {
    if (e.name === 'FunctionCall') {
      threadCounts.set(e.tid, (threadCounts.get(e.tid) ?? 0) + 1);
    }
  }

  let maxTid = 0;
  let maxCount = 0;
  for (const [tid, count] of threadCounts) {
    if (count > maxCount) {
      maxTid = tid;
      maxCount = count;
    }
  }
  return maxTid;
}

/**
 * Extract function calls that block the main thread (> 50ms).
 *
 * Looks for "FunctionCall" and "EvaluateScript" events with phase "X" (complete)
 * and duration > 50ms. Extracts function name, script URL, line number, and call stack.
 */
export function extractBlockingFunctions(
  mainEvents: TraceEvent[],
  navigationStartTs: number,
): BlockingFunction[] {
  const results: BlockingFunction[] = [];

  for (const e of mainEvents) {
    if (
      e.ph !== 'X' ||
      !BLOCKING_EVENT_NAMES.has(e.name) ||
      !e.dur ||
      e.dur < BLOCKING_THRESHOLD_US
    ) {
      continue;
    }

    const data = e.args?.data;
    const functionName = data?.functionName || e.name;
    const scriptUrl = data?.url || '';
    const lineNumber = data?.lineNumber ?? 0;
    const columnNumber = data?.columnNumber ?? 0;

    const callStack: BlockingFunction['callStack'] = [];
    if (data?.stackTrace) {
      for (const frame of data.stackTrace) {
        callStack.push({
          functionName: frame.functionName || '(anonymous)',
          scriptUrl: frame.url || '',
          lineNumber: frame.lineNumber ?? 0,
        });
      }
    }

    results.push({
      functionName,
      scriptUrl,
      lineNumber,
      columnNumber,
      duration: e.dur / 1000, // μs → ms
      startTime: (e.ts - navigationStartTs) / 1000, // μs → ms relative
      callStack,
      category: 'scripting',
    });
  }

  // Sort by duration descending (longest blocking first)
  results.sort((a, b) => b.duration - a.duration);
  return results;
}

/**
 * Extract event listener dispatch patterns.
 *
 * Groups EventDispatch events by event type and counts dispatches.
 * Also collects source location information.
 */
export function extractEventListenerInfo(mainEvents: TraceEvent[]): EventListenerInfo[] {
  const eventMap = new Map<
    string,
    {
      count: number;
      totalDuration: number;
      sources: Map<string, { scriptUrl: string; lineNumber: number; count: number }>;
    }
  >();

  for (const e of mainEvents) {
    if (e.name !== 'EventDispatch' || e.ph !== 'X') continue;

    const eventType = e.args?.data?.type || 'unknown';
    let entry = eventMap.get(eventType);
    if (!entry) {
      entry = { count: 0, totalDuration: 0, sources: new Map() };
      eventMap.set(eventType, entry);
    }
    entry.count++;
    entry.totalDuration += (e.dur ?? 0) / 1000;

    // Track source locations
    const url = e.args?.data?.url || '';
    const line = e.args?.data?.lineNumber ?? 0;
    if (url) {
      const key = `${url}:${line}`;
      const src = entry.sources.get(key);
      if (src) {
        src.count++;
      } else {
        entry.sources.set(key, { scriptUrl: url, lineNumber: line, count: 1 });
      }
    }
  }

  const results: EventListenerInfo[] = [];
  for (const [eventType, data] of eventMap) {
    results.push({
      eventType,
      addCount: data.count, // dispatch count as proxy for add count
      removeCount: 0, // not directly observable from trace alone
      activeCount: data.count,
      sources: Array.from(data.sources.values()),
    });
  }

  // Sort by dispatch count descending
  results.sort((a, b) => b.addCount - a.addCount);
  return results;
}

/**
 * Build a frame time breakdown from main-thread events.
 *
 * Categorises all events with duration into: scripting, layout, painting, gc, other.
 * All values are in milliseconds.
 */
export function buildFrameBreakdown(mainEvents: TraceEvent[]): FrameBreakdown {
  let scripting = 0;
  let layout = 0;
  let painting = 0;
  let gc = 0;
  let other = 0;

  for (const e of mainEvents) {
    if (e.ph !== 'X' || !e.dur) continue;

    const durMs = e.dur / 1000;

    if (SCRIPTING_EVENTS.has(e.name)) {
      scripting += durMs;
    } else if (LAYOUT_EVENTS.has(e.name)) {
      layout += durMs;
    } else if (PAINTING_EVENTS.has(e.name)) {
      painting += durMs;
    } else if (GC_EVENT_NAMES.has(e.name)) {
      gc += durMs;
    } else {
      other += durMs;
    }
  }

  const totalTime = scripting + layout + painting + gc + other;

  return {
    totalTime: round(totalTime),
    scripting: round(scripting),
    layout: round(layout),
    painting: round(painting),
    gc: round(gc),
    other: round(other),
  };
}

/**
 * Extract GC events (MajorGC, MinorGC) with timing and heap size data.
 */
export function extractGCEvents(mainEvents: TraceEvent[], navigationStartTs: number): GCEvent[] {
  const results: GCEvent[] = [];

  for (const e of mainEvents) {
    if (e.ph !== 'X' || !GC_EVENT_NAMES.has(e.name)) continue;

    results.push({
      startTime: round((e.ts - navigationStartTs) / 1000),
      duration: round((e.dur ?? 0) / 1000),
      type: e.name,
      usedHeapSizeBefore: e.args?.data?.usedHeapSizeBefore,
      usedHeapSizeAfter: e.args?.data?.usedHeapSizeAfter,
    });
  }

  // Sort by start time
  results.sort((a, b) => a.startTime - b.startTime);
  return results;
}

/**
 * Find frequently dispatched events (> 10 dispatches of the same type).
 * High-frequency dispatches without throttle/debounce indicate potential issues.
 */
export function findFrequentEvents(
  mainEvents: TraceEvent[],
): Array<{ eventType: string; count: number; totalDuration: number }> {
  const counts = new Map<string, { count: number; totalDuration: number }>();

  for (const e of mainEvents) {
    if (e.name !== 'EventDispatch' || e.ph !== 'X') continue;
    const eventType = e.args?.data?.type || 'unknown';
    const entry = counts.get(eventType);
    if (entry) {
      entry.count++;
      entry.totalDuration += (e.dur ?? 0) / 1000;
    } else {
      counts.set(eventType, { count: 1, totalDuration: (e.dur ?? 0) / 1000 });
    }
  }

  const results: Array<{ eventType: string; count: number; totalDuration: number }> = [];
  for (const [eventType, data] of counts) {
    if (data.count > 10) {
      results.push({
        eventType,
        count: data.count,
        totalDuration: round(data.totalDuration),
      });
    }
  }

  results.sort((a, b) => b.count - a.count);
  return results;
}

// ── Helpers ────────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptyRuntimeTrace(): RuntimeTraceSummary {
  return {
    totalEvents: 0,
    mainThreadId: 0,
    traceDuration: 0,
    frameBreakdown: {
      totalTime: 0,
      scripting: 0,
      layout: 0,
      painting: 0,
      gc: 0,
      other: 0,
    },
    blockingFunctions: [],
    eventListeners: [],
    gcEvents: [],
    frequentEvents: [],
  };
}
