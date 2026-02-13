/**
 * TypeScript types for the zeitzeuge Vitest integration.
 */

// ── Source classification ──

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

// ── Plugin options ──

/** Options for the zeitzeuge Vitest plugin. */
export interface ZeitZeugeVitestOptions {
  /** Enable/disable the plugin. Default: true */
  enabled?: boolean;
  /** Path for the Markdown report. Default: 'zeitzeuge-report.md' */
  output?: string;
  /** Directory for temporary .cpuprofile files. Default: '.zeitzeuge-profiles' */
  profileDir?: string;
  /**
   * Also enable V8 heap profiling via Node's `--heap-prof`.
   *
   * This writes `.heapprofile` artifacts on worker process exit (much cheaper
   * than heap snapshots). Files are written into `profileDir` via
   * `--heap-prof-dir=<profileDir>`.
   *
   * Default: false
   */
  heapProf?: boolean;
  /** Run Deep Agent analysis after tests finish. Default: true */
  analyzeOnFinish?: boolean;
  /** Enable debug logging. Default: false */
  verbose?: boolean;
  /**
   * Project root directory. Used to classify hot functions as
   * "application code" vs "dependency" vs "test framework".
   * Default: process.cwd()
   */
  projectRoot?: string;
}

// ── Test timing ──

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

// ── Correlated profile ──

/** A CPU profile correlated with its test file. */
export interface CorrelatedProfile {
  testFile: string;
  profilePath: string;
  summary: CpuProfileSummary;
}

// ── Correlated heap profile ──

/** A V8 heap profile correlated with its test file. */
export interface CorrelatedHeapProfile {
  testFile: string;
  profilePath: string;
  summary: HeapProfileSummary;
}

// ── V8 CPU Profile raw format ──

/** Raw V8 CPU profile as written by --cpu-prof. */
export interface V8CpuProfile {
  nodes: V8CpuProfileNode[];
  startTime: number; // microseconds
  endTime: number; // microseconds
  samples: number[]; // node IDs sampled at each interval
  timeDeltas: number[]; // microseconds between samples
}

/** A single node in the V8 CPU profile call tree. */
export interface V8CpuProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  hitCount: number;
  children?: number[];
  positionTicks?: Array<{
    line: number;
    ticks: number;
  }>;
}

// ── V8 Heap Profile raw format (from --heap-prof) ──

/** Raw V8 heap profile as written by Node.js `--heap-prof`. */
export interface V8HeapProfile {
  head: V8HeapProfileNode;
  /** Milliseconds since epoch (V8 internal), optional across versions */
  startTime?: number;
  /** Milliseconds since epoch (V8 internal), optional across versions */
  endTime?: number;
  samples: V8HeapProfileSample[];
}

export interface V8HeapProfileSample {
  /** Bytes allocated for this sample */
  size: number;
  /** Call-tree node id this sample is attributed to */
  nodeId: number;
  /** Sample ordinal (monotonic), optional across versions */
  ordinal?: number;
}

export interface V8HeapProfileNode {
  id: number;
  callFrame: {
    functionName: string;
    scriptId: string;
    url: string;
    lineNumber: number;
    columnNumber: number;
  };
  children?: V8HeapProfileNode[];
}

// ── Parsed profile output ──

/** Structured summary of a parsed V8 CPU profile. */
export interface CpuProfileSummary {
  /** Source .cpuprofile file path */
  profilePath: string;
  /** Total profile duration in ms */
  duration: number;
  /** Sample count */
  sampleCount: number;
  /** Top functions by self time */
  hotFunctions: HotFunction[];
  /** Top functions by total time (inclusive of callees) */
  expensiveCallTrees: CallTreeNode[];
  /** GC-related samples (functions in (garbage collector) category) */
  gcSamples: number;
  gcPercentage: number;
  /** Idle samples (percentage of time not doing work) */
  idlePercentage: number;
  /** Per-script time breakdown */
  scriptBreakdown: ScriptTimeSummary[];
}

/** A function consuming significant CPU self time. */
export interface HotFunction {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  columnNumber: number;
  /** Self time in ms (excluding callees) */
  selfTime: number;
  /** Total time in ms (including callees) */
  totalTime: number;
  /** Number of samples hitting this function */
  hitCount: number;
  /** Percentage of total profile time */
  selfPercent: number;
  /** Classification of the function's source file */
  sourceCategory?: SourceCategory;
}

/** A node in the call tree with inclusive timing. */
export interface CallTreeNode {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  /** Total time in ms (inclusive) */
  totalTime: number;
  totalPercent: number;
  /** Direct callees, sorted by total time */
  children: CallTreeNode[];
}

/** Per-script time aggregation. */
export interface ScriptTimeSummary {
  scriptUrl: string;
  /** Total self time across all functions in this script */
  selfTime: number;
  selfPercent: number;
  /** Number of distinct functions sampled */
  functionCount: number;
  /** Classification of this script */
  sourceCategory?: SourceCategory;
}

// ── Parsed heap profile output ──

/** A function with significant allocated bytes (self-attributed). */
export interface AllocationHotspot {
  functionName: string;
  scriptUrl: string;
  lineNumber: number;
  columnNumber: number;
  /** Self-attributed allocated bytes */
  selfBytes: number;
  /** Percent of total allocated bytes */
  selfPercent: number;
  /** Classification of the function's source file */
  sourceCategory?: SourceCategory;
}

/** Per-script allocated-bytes aggregation. */
export interface ScriptAllocationSummary {
  scriptUrl: string;
  /** Total self-attributed allocated bytes across all functions in this script */
  selfBytes: number;
  selfPercent: number;
  /** Number of distinct functions sampled */
  functionCount: number;
  /** Classification of this script */
  sourceCategory?: SourceCategory;
}

/** Structured summary of a parsed V8 heap profile. */
export interface HeapProfileSummary {
  /** Source .heapprofile file path */
  profilePath: string;
  /** Total allocated bytes across all samples */
  totalAllocatedBytes: number;
  /** Allocation sample count */
  sampleCount: number;
  /** Top allocation hotspots by self bytes */
  topAllocations: AllocationHotspot[];
  /** Per-script allocated-bytes breakdown */
  scriptBreakdown: ScriptAllocationSummary[];
}

// ── Workspace options ──

/** Options for building the Vitest analysis workspace. */
export interface VitestWorkspaceOptions {
  testTiming: TestFileTiming[];
  profiles: CorrelatedProfile[];
  /** Optional heap profiles (from --heap-prof) correlated with test files. */
  heapProfiles?: CorrelatedHeapProfile[];
  /** Map of test file path → source code */
  testSources: Map<string, string>;
  /** Map of scriptUrl → source code (for hot function source files) */
  sourcePaths?: Map<string, string>;
  /** Project root for resolving relative paths */
  projectRoot?: string;
}
