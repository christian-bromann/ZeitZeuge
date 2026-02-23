/**
 * TypeScript types for the zeitzeuge Node.js test runner integration.
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

/** Options for the zeitzeuge Node.js test runner integration. */
export interface ZeitZeugeNodeTestOptions {
  /** Enable/disable the integration. Default: true */
  enabled?: boolean;
  /** Path for the Markdown report. Default: 'zeitzeuge-report.md' */
  output?: string;
  /** Directory for temporary .cpuprofile files. Default: '.zeitzeuge-profiles' */
  profileDir?: string;
  /** Also enable V8 heap profiling via `--heap-prof`. Default: false */
  heapProf?: boolean;
  /** Run Deep Agent analysis after tests finish. Default: true */
  analyzeOnFinish?: boolean;
  /** Enable debug logging. Default: false */
  verbose?: boolean;
  /** Project root directory. Default: process.cwd() */
  projectRoot?: string;
}

/** Re-export V8 profile types from the vitest package for shared parsing. */
export interface V8CpuProfile {
  nodes: V8CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

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

export interface V8HeapProfile {
  head: V8HeapProfileNode;
  startTime?: number;
  endTime?: number;
  samples: V8HeapProfileSample[];
}

export interface V8HeapProfileSample {
  size: number;
  nodeId: number;
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
