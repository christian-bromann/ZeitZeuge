/**
 * Public entry point for the @zeitzeuge/bun integration.
 *
 * Usage:
 *
 * ```bash
 * # Run tests with profiling enabled
 * bun test --preload @zeitzeuge/bun/preload
 *
 * # Or programmatically analyze after test run
 * ```
 *
 * ```ts
 * import { analyzeTestRun } from '@zeitzeuge/bun';
 *
 * await analyzeTestRun({
 *   profileDir: '.zeitzeuge-profiles',
 *   output: 'zeitzeuge-report.md',
 * });
 * ```
 */

export { analyzeTestRun } from './plugin.js';
export { parseBunProfile } from './profile-adapter.js';
export { classifyScript } from './classify.js';
export type { ZeitZeugeBunTestOptions, JSCProfile, JSCProfileNode } from './types.js';

export type {
  SourceCategory,
  PerformanceMetrics,
  CpuProfileSummary,
  HotFunction,
  TestFileTiming,
  CorrelatedProfile,
} from './types.js';
