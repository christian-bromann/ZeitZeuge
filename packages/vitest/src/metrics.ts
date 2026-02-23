/**
 * Performance metrics computation for Vitest test runs.
 *
 * Re-exports the shared implementation from @zeitzeuge/utils.
 * Kept as a separate module for backward compatibility.
 */

export { computeMetrics } from '@zeitzeuge/utils';

export type {
  SuiteMetrics,
  CpuMetrics,
  FileMetric,
  TestMetric,
  HotFunctionMetric,
  PerformanceMetrics,
} from '@zeitzeuge/utils';
