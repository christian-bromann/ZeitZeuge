import { z } from 'zod';
import { FindingSchema } from './schema';

/**
 * Shared TypeScript types for zeitzeuge.
 */
export type Finding = z.infer<typeof FindingSchema>;

// ── Heap snapshot types (unchanged from Spec 001) ──

/** The structured summary produced by the heap snapshot parser. */
export interface HeapSummary {
  metadata: {
    url: string;
    capturedAt: number;
    totalSize: number;
    nodeCount: number;
    edgeCount: number;
  };
  largestObjects: LargestObject[];
  typeStats: TypeStat[];
  constructorStats: ConstructorStat[];
  detachedNodes: DetachedNodeInfo;
  closureStats: ClosureStats;
}

/** A single large object from the heap, sorted by retained size. */
export interface LargestObject {
  name: string;
  type: string;
  selfSize: number;
  retainedSize: number;
  retainerPath: string[];
}

/** Aggregated statistics for a node type (e.g. "object", "closure", "string"). */
export interface TypeStat {
  type: string;
  count: number;
  totalSize: number;
  avgSize: number;
}

/** Aggregated statistics for a constructor (e.g. "Array", "Map", "HTMLDivElement"). */
export interface ConstructorStat {
  constructor: string;
  count: number;
  totalSize: number;
  avgSize: number;
}

/** Information about detached DOM nodes found in the heap. */
export interface DetachedNodeInfo {
  count: number;
  totalSize: number;
  examples: Array<{
    name: string;
    retainerPath: string[];
  }>;
}

/** Statistics about closures retaining scope variables. */
export interface ClosureStats {
  count: number;
  totalSize: number;
  topClosures: Array<{
    name: string;
    contextSize: number;
    retainerPath: string[];
  }>;
}

// ── Raw capture types ──

/** Raw heap snapshot data as captured from CDP. */
export interface RawSnapshot {
  /** The full JSON string of the V8 heap snapshot. */
  data: string;
  /** Timestamp when the snapshot was captured. */
  capturedAt: number;
  /** The URL that was loaded. */
  url: string;
}

// ── Trace types ──

/** A network request captured during page load. */
export interface NetworkRequest {
  requestId: string;
  url: string;
  method: string;
  resourceType: string;
  mimeType: string;
  status: number;
  encodedSize: number;
  decodedSize: number;
  /** Timing in ms relative to navigation start */
  startTime: number;
  endTime: number;
  duration: number;
  isRenderBlocking: boolean;
  /** Actual response body (text-based resources only) */
  responseBody: string | null;
  priority: string;
  initiator: string;
}

/** Page load timing metrics. */
export interface PageMetrics {
  navigationStart: number;
  domContentLoaded: number;
  loadComplete: number;
  firstPaint: number;
  firstContentfulPaint: number;
  largestContentfulPaint: number;
  totalBlockingTime: number;
  longTasks: LongTask[];
}

/** A long task detected during page load (> 50ms). */
export interface LongTask {
  startTime: number;
  duration: number;
  /** Script URL if attributable */
  scriptUrl: string | null;
}

/** Result of performance tracing during page load. */
export interface TraceResult {
  networkRequests: NetworkRequest[];
  metrics: PageMetrics;
  /** Runtime trace summary from Chrome Tracing domain (optional for backwards compat). */
  runtimeTrace?: RuntimeTraceSummary;
  /** Raw Chrome trace events from the Tracing domain — for storage in the workspace. */
  rawTraceEvents?: TraceEvent[];
}

// ── Runtime trace types (from Chrome Tracing domain) ──

/** A single Chrome trace event from the Tracing domain. */
export interface TraceEvent {
  cat: string;
  name: string;
  ph: string;
  ts: number;
  dur?: number;
  pid: number;
  tid: number;
  args?: {
    name?: string;
    data?: {
      functionName?: string;
      url?: string;
      lineNumber?: number;
      columnNumber?: number;
      type?: string;
      frame?: string;
      stackTrace?: Array<{
        functionName: string;
        url: string;
        lineNumber: number;
        columnNumber: number;
      }>;
      usedHeapSizeBefore?: number;
      usedHeapSizeAfter?: number;
    };
  };
}

/** A function call that blocked the main thread. */
export interface BlockingFunction {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  columnNumber: number;
  /** Duration in ms */
  duration: number;
  /** Timestamp in ms relative to navigation start */
  startTime: number;
  /** Call stack (caller chain) */
  callStack: Array<{
    functionName: string;
    scriptUrl: string;
    lineNumber: number;
  }>;
  /** Category of work: "scripting" | "layout" | "paint" | "gc" */
  category: string;
}

/** Aggregated event listener data. */
export interface EventListenerInfo {
  eventType: string;
  /** Number of times addEventListener was called for this type */
  addCount: number;
  /** Number of times removeEventListener was called for this type */
  removeCount: number;
  /** Net active listeners (add - remove) */
  activeCount: number;
  /** Scripts that registered listeners */
  sources: Array<{
    scriptUrl: string;
    lineNumber: number;
    count: number;
  }>;
}

/** Per-frame time breakdown. */
export interface FrameBreakdown {
  totalTime: number;
  scripting: number;
  layout: number;
  painting: number;
  gc: number;
  other: number;
}

/** GC event detail. */
export interface GCEvent {
  /** Timestamp in ms relative to navigation start */
  startTime: number;
  /** Duration in ms */
  duration: number;
  /** Type: "MajorGC" or "MinorGC" */
  type: string;
  /** Bytes used before GC, if available */
  usedHeapSizeBefore?: number;
  /** Bytes used after GC, if available */
  usedHeapSizeAfter?: number;
}

/** Complete runtime trace summary. */
export interface RuntimeTraceSummary {
  totalEvents: number;
  mainThreadId: number;
  /** Duration of the trace in ms */
  traceDuration: number;
  /** Frame time breakdown */
  frameBreakdown: FrameBreakdown;
  /** Functions that blocked the main thread > 50ms, sorted by duration */
  blockingFunctions: BlockingFunction[];
  /** Event listener add/remove imbalances */
  eventListeners: EventListenerInfo[];
  /** GC events */
  gcEvents: GCEvent[];
  /** Top repeated event dispatches (possible missing throttle/debounce) */
  frequentEvents: Array<{
    eventType: string;
    count: number;
    totalDuration: number;
  }>;
}

/** Handle returned by tracePageLoad — call stop() after page settles. */
export interface TraceHandle {
  stop(): Promise<TraceResult>;
}

/** Combined result of unified page capture (heap + trace). */
export interface CaptureResult {
  heapSnapshot: RawSnapshot;
  trace: TraceResult;
}

// ── Options types ──

/** Options for page capture. */
export interface CaptureOptions {
  /** Page load timeout in milliseconds. */
  timeout?: number;
}

/** Options for browser launch. */
export interface LaunchOptions {
  /** Run Chrome in headless mode. */
  headless?: boolean;
}
