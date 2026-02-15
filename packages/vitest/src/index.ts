/**
 * Public entry point for the @zeitzeuge/vitest integration.
 *
 * Usage in vitest.config.ts:
 *
 * ```ts
 * import { defineConfig } from 'vitest/config'
 * import { zeitzeuge } from '@zeitzeuge/vitest'
 *
 * export default defineConfig({
 *   plugins: [zeitzeuge()],
 * })
 * ```
 */

export { zeitzeuge } from './plugin.js';
export { analyzeTestPerformance, type VitestAnalysisContext } from './agent.js';
export {
  VITEST_SYSTEM_PROMPT,
  CPU_HOTSPOT_PROMPT,
  LISTENER_LEAK_PROMPT,
  MEMORY_CLOSURE_PROMPT,
  CODE_PATTERN_PROMPT,
} from './prompts.js';
export { deduplicateFindings, rankFindings, extractFunctionName } from './deduplication.js';
export type { ZeitZeugeVitestOptions } from './types.js';
export type { SourceCategory } from '@zeitzeuge/utils';
export type {
  PerformanceMetrics,
  SuiteMetrics,
  CpuMetrics,
  FileMetric,
  TestMetric,
  HotFunctionMetric,
} from '@zeitzeuge/utils';
export { computeMetrics } from './metrics.js';

// Internal APIs re-exported for use by evals and future integrations
export { parseCpuProfile } from './profile-parser.js';
export { createVitestWorkspace, mergeHotFunctions } from './workspace.js';
export { classifyScript } from './classify.js';
export {
  aggregateListenerTracking,
  generateListenerTrackerScript,
  LISTENER_TRACKING_JSONL,
  type RawListenerTrackingData,
  type RawListenerExceedance,
} from './listener-tracker.js';
export type {
  V8CpuProfile,
  V8CpuProfileNode,
  V8HeapProfile,
  V8HeapProfileSample,
  V8HeapProfileNode,
  AllocationHotspot,
  ScriptAllocationSummary,
  HeapProfileSummary,
  CorrelatedHeapProfile,
  VitestWorkspaceOptions,
} from './types.js';
