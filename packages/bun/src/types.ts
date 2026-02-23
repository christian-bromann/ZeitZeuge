/**
 * TypeScript types for the zeitzeuge Bun test runner integration.
 */

export type {
  SourceCategory,
  TestFileTiming,
  CorrelatedProfile,
  CpuProfileSummary,
  HotFunction,
  CallerFrame,
  CallTreeNode,
  ScriptTimeSummary,
  PerformanceMetrics,
} from '@zeitzeuge/utils';

/** Options for the zeitzeuge Bun test runner integration. */
export interface ZeitZeugeBunTestOptions {
  /** Enable/disable the integration. Default: true */
  enabled?: boolean;
  /** Path for the Markdown report. Default: 'zeitzeuge-report.md' */
  output?: string;
  /** Directory for temporary profile files. Default: '.zeitzeuge-profiles' */
  profileDir?: string;
  /** Run Deep Agent analysis after tests finish. Default: true */
  analyzeOnFinish?: boolean;
  /** Enable debug logging. Default: false */
  verbose?: boolean;
  /** Project root directory. Default: process.cwd() */
  projectRoot?: string;
}

/**
 * Bun's JSC sampling profiler output format from bun:jsc profile().
 * The profile is a tree of call frames with timing information.
 */
export interface JSCProfile {
  nodes: JSCProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

export interface JSCProfileNode {
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
}
