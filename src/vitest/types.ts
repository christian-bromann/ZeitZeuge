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

// ── Workspace options ──

/** Options for building the Vitest analysis workspace. */
export interface VitestWorkspaceOptions {
  testTiming: TestFileTiming[];
  profiles: CorrelatedProfile[];
  /** Map of test file path → source code */
  testSources: Map<string, string>;
  /** Map of scriptUrl → source code (for hot function source files) */
  sourcePaths?: Map<string, string>;
  /** Project root for resolving relative paths */
  projectRoot?: string;
}
