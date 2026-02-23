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
  /** Rendering diagnostic data from screencast capture (optional). */
  renderingDiagnostic?: RenderingDiagnostic;
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

// ── Screencast / FCP rendering diagnostics ──

/** A single frame captured by CDP Page.startScreencast. */
export interface ScreencastFrame {
  /** Timestamp in ms relative to navigation start. */
  timestamp: number;
  /** Base64-encoded image data (JPEG). */
  data: string;
  /** Session ID for acknowledging receipt. */
  sessionId: number;
  /** Byte length of the base64-decoded image. */
  dataLength: number;
}

/** Summary of a screencast frame (without the full image data). */
export interface FrameSummary {
  /** Frame index (0-based). */
  index: number;
  /** Timestamp in ms relative to navigation start. */
  timestamp: number;
  /** Byte length of the decoded image. */
  dataLength: number;
  /** Whether a significant visual change was detected relative to the previous frame. */
  isVisualChange: boolean;
}

/** A detected visual change point in the screencast filmstrip. */
export interface VisualChangePoint {
  /** Timestamp in ms relative to navigation start. */
  timestamp: number;
  /** Index into the frames array. */
  frameIndex: number;
  /** Percentage of visual completeness (0-100) estimated from frame data size. */
  visualCompleteness: number;
  /** Magnitude of the change relative to the final frame (0-1). */
  changeMagnitude: number;
}

/** Correlation of FCP with other diagnostic data. */
export interface FCPCorrelation {
  /** FCP timestamp in ms relative to navigation start. */
  fcpTimestamp: number;
  /** Index of the screencast frame nearest to FCP. */
  nearestFrameIndex: number;
  /** Network requests that completed before FCP. */
  resourcesLoadedBeforeFCP: Array<{
    url: string;
    resourceType: string;
    duration: number;
    isRenderBlocking: boolean;
    endTime: number;
  }>;
  /** Network requests still loading at FCP time. */
  resourcesLoadingAtFCP: Array<{
    url: string;
    resourceType: string;
    startTime: number;
  }>;
  /** Render-blocking resources that had to complete before FCP. */
  renderBlockingChain: Array<{
    url: string;
    resourceType: string;
    duration: number;
    size: number;
  }>;
  /** Blocking main-thread functions that executed before FCP. */
  mainThreadBlockersBeforeFCP: Array<{
    functionName: string;
    scriptUrl: string;
    duration: number;
    startTime: number;
  }>;
  /** Total time the main thread was blocked before FCP. */
  totalBlockingTimeBeforeFCP: number;
  /** Time spent in layout/style recalculation before FCP. */
  layoutTimeBeforeFCP: number;
}

/** Identified rendering phase during page load. */
export interface RenderingPhase {
  /** Phase name. */
  name: string;
  /** Start time in ms relative to navigation start. */
  startTime: number;
  /** End time in ms relative to navigation start. */
  endTime: number;
  /** Duration in ms. */
  duration: number;
  /** Human-readable description. */
  description: string;
}

/** Complete rendering diagnostic data. */
export interface RenderingDiagnostic {
  /** Screencast frame summaries (without image data). */
  filmstrip: FrameSummary[];
  /** Detected visual change points. */
  visualChanges: VisualChangePoint[];
  /** FCP correlation data. */
  fcpCorrelation: FCPCorrelation;
  /** Rendering phases from navigation to load complete. */
  renderingPhases: RenderingPhase[];
  /** Speed Index approximation based on visual progress. */
  speedIndex: number;
  /** Suggestions for improving FCP based on the diagnostics. */
  fcpBottlenecks: FCPBottleneck[];
}

/** An identified bottleneck affecting FCP. */
export interface FCPBottleneck {
  /** Type of bottleneck. */
  type:
    | 'render-blocking-resource'
    | 'long-task-before-fcp'
    | 'large-dom'
    | 'slow-server-response'
    | 'sequential-resource-chain'
    | 'excessive-layout';
  /** Human-readable description. */
  description: string;
  /** Estimated FCP delay caused by this bottleneck in ms. */
  estimatedDelayMs: number;
  /** Related resource URL or function name. */
  source: string;
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
  /** Enable screencast-based rendering diagnostics. Default: true */
  screencast?: boolean;
}

/** Options for browser launch. */
export interface LaunchOptions {
  /** Run Chrome in headless mode. */
  headless?: boolean;
}

// ── Vitest / test-runner shared types ──
// These are pure data shape interfaces used by output/terminal, output/report,
// and analysis/agent. Implementations (computeMetrics, aggregateListenerTracking,
// etc.) live in @zeitzeuge/vitest.

/**
 * Classification of a script/function based on its file path.
 *
 * - `application` — files within the project source tree (the code being tested)
 * - `dependency`  — files inside node_modules (third-party libraries)
 * - `test`        — test files (*.test.*, *.spec.*, *.bench.*)
 * - `framework`   — vitest / tinybench / v8 internals
 * - `unknown`     — could not be classified (e.g. eval, no URL)
 */
export type SourceCategory = 'application' | 'dependency' | 'test' | 'framework' | 'unknown';

/** Timing data extracted from a Vitest TestModule. */
export interface TestFileTiming {
  file: string;
  duration: number;
  testCount: number;
  passCount: number;
  failCount: number;
  setupTime: number;
  tests: Array<{
    name: string;
    duration: number;
    status: 'pass' | 'fail' | 'skip';
  }>;
}

/** A CPU profile correlated with its test file. */
export interface CorrelatedProfile {
  testFile: string;
  profilePath: string;
  summary: CpuProfileSummary;
}

/** Structured summary of a parsed V8 CPU profile. */
export interface CpuProfileSummary {
  profilePath: string;
  duration: number;
  sampleCount: number;
  hotFunctions: HotFunction[];
  expensiveCallTrees: CallTreeNode[];
  gcSamples: number;
  gcPercentage: number;
  idlePercentage: number;
  scriptBreakdown: ScriptTimeSummary[];
}

/** A function consuming significant CPU self time. */
export interface HotFunction {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  columnNumber: number;
  selfTime: number;
  totalTime: number;
  hitCount: number;
  selfPercent: number;
  sourceCategory?: SourceCategory;
  callerChain?: CallerFrame[];
}

/** A frame in a caller chain. */
export interface CallerFrame {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
}

/** A node in the call tree with inclusive timing. */
export interface CallTreeNode {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  totalTime: number;
  totalPercent: number;
  children: CallTreeNode[];
}

/** Per-script time aggregation. */
export interface ScriptTimeSummary {
  scriptUrl: string;
  selfTime: number;
  selfPercent: number;
  functionCount: number;
  sourceCategory?: SourceCategory;
}

// ── Event listener tracking types ──

/** Aggregated event listener tracking data across all worker processes. */
export interface EventListenerTracking {
  eventTargetCounts: Record<string, { addCount: number; removeCount: number }>;
  emitterCounts: Record<string, { addCount: number; removeCount: number }>;
  exceedances: ListenerExceedance[];
}

export interface ListenerExceedance {
  targetType: string;
  eventType: string;
  listenerCount: number;
  threshold: number;
  stack?: string;
}

export interface ListenerImbalance {
  api: 'EventTarget' | 'EventEmitter';
  type: string;
  addCount: number;
  removeCount: number;
}

/**
 * Minimum difference between add and remove counts before an event type
 * is considered to have a notable listener imbalance.
 */
export const LISTENER_IMBALANCE_THRESHOLD = 5;

/**
 * Return event types where listeners were added significantly more often
 * than they were removed, combining both EventTarget and EventEmitter counts.
 */
export function getListenerImbalances(tracking: EventListenerTracking): ListenerImbalance[] {
  return [
    ...Object.entries(tracking.eventTargetCounts).map(([t, c]) => ({
      api: 'EventTarget' as const,
      type: t,
      ...c,
    })),
    ...Object.entries(tracking.emitterCounts).map(([t, c]) => ({
      api: 'EventEmitter' as const,
      type: t,
      ...c,
    })),
  ]
    .filter((c) => c.addCount > c.removeCount + LISTENER_IMBALANCE_THRESHOLD)
    .sort((a, b) => b.addCount - b.removeCount - (a.addCount - a.removeCount));
}

// ── Performance metrics types ──

/** Suite-level aggregate metrics. */
export interface SuiteMetrics {
  totalDuration: number;
  totalTests: number;
  passCount: number;
  failCount: number;
  totalSetupTime: number;
  averageTestDuration: number;
  medianTestDuration: number;
  p95TestDuration: number;
  slowestTestDuration: number;
  slowestTestName: string;
  slowestFileDuration: number;
  slowestFile: string;
}

/** CPU profile-derived metrics. */
export interface CpuMetrics {
  gcPercentage: number;
  gcTime: number;
  idlePercentage: number;
  idleTime: number;
  applicationTime: number;
  applicationPercent: number;
  dependencyTime: number;
  dependencyPercent: number;
  testFrameworkTime: number;
  testFrameworkPercent: number;
}

/** Per-file metric entry. */
export interface FileMetric {
  duration: number;
  testCount: number;
  setupTime: number;
  gcPercentage: number;
}

/** Per-test metric entry. */
export interface TestMetric {
  duration: number;
  status: 'pass' | 'fail' | 'skip';
}

/** Summary of a hot function for metrics display. */
export interface HotFunctionMetric {
  key: string;
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  selfTime: number;
  selfPercent: number;
  sourceCategory: string;
}

/** Complete performance metrics snapshot for a test run. */
export interface PerformanceMetrics {
  version: 1;
  timestamp: string;
  suite: SuiteMetrics;
  cpu: CpuMetrics;
  files: Record<string, FileMetric>;
  tests: Record<string, TestMetric>;
  hotFunctions: HotFunctionMetric[];
  heap?: {
    totalAllocatedBytes: number;
  };
  listenerTracking?: EventListenerTracking;
}

// ── Test workspace options ──

/** Minimal heap profile shape for the workspace builder. */
export interface CorrelatedHeapProfile {
  testFile: string;
  profilePath: string;
  summary: { totalAllocatedBytes: number };
}

/** Options for building a test analysis workspace (shared across all runners). */
export interface TestWorkspaceOptions {
  testTiming: TestFileTiming[];
  profiles: CorrelatedProfile[];
  heapProfiles?: CorrelatedHeapProfile[];
  testSources: Map<string, string>;
  sourcePaths?: Map<string, string>;
  projectRoot?: string;
  metrics?: PerformanceMetrics;
  listenerTracking?: EventListenerTracking;
}

/** Result from creating a test analysis workspace. */
export interface TestWorkspaceResult {
  backend: import('deepagents').BackendProtocol;
  cleanup: () => Promise<void>;
  sourceFiles: string[];
  testFiles: string[];
}

/** Context for building a test analysis user message. */
export interface TestAnalysisContext {
  metrics: PerformanceMetrics;
  hasHeapProfiles: boolean;
  hasListenerTracking: boolean;
  sourceFiles?: string[];
  testFiles?: string[];
}
