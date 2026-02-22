/**
 * Public entry point for the @zeitzeuge/node-test integration.
 *
 * Usage with Node.js test runner:
 *
 * ```bash
 * # Step 1: Run tests with CPU profiling and zeitzeuge reporter
 * node --test \
 *   --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \
 *   --test-reporter @zeitzeuge/node-test/reporter \
 *   --test-reporter-destination stdout \
 *   tests/*.test.js
 *
 * # Step 2: Or use the programmatic API
 * ```
 *
 * ```ts
 * import { runZeitZeugeAnalysis } from '@zeitzeuge/node-test';
 *
 * await runZeitZeugeAnalysis({
 *   profileDir: '.zeitzeuge-profiles',
 *   testFiles: ['tests/my-test.test.js'],
 * });
 * ```
 */

export { default as zeitZeugeReporter } from './reporter.js';
export { analyzeTestPerformance, type NodeTestAnalysisContext } from './agent.js';
export { NODE_TEST_SYSTEM_PROMPT } from './prompts.js';
export type { ZeitZeugeNodeTestOptions } from './types.js';
export { computeMetrics } from './metrics.js';
export { parseCpuProfile } from './profile-parser.js';
export { createNodeTestWorkspace, mergeHotFunctions } from './workspace.js';
export { classifyScript } from './classify.js';

export type {
  SourceCategory,
  PerformanceMetrics,
  CpuProfileSummary,
  HotFunction,
  TestFileTiming,
  CorrelatedProfile,
} from './types.js';
