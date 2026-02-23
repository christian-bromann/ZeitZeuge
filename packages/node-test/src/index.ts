/**
 * Public entry point for the @zeitzeuge/node-test integration.
 *
 * Usage with Node.js test runner:
 *
 * ```bash
 * node --test \
 *   --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \
 *   --test-reporter @zeitzeuge/node-test/reporter \
 *   --test-reporter-destination stdout \
 *   tests/*.test.js
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
} from '@zeitzeuge/utils';
