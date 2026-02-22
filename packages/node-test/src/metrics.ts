/**
 * Performance metrics computation — re-exports from @zeitzeuge/vitest.
 *
 * The metrics computation is identical regardless of which test runner
 * produced the data (same TestFileTiming and CorrelatedProfile shapes).
 */
export { computeMetrics } from '../../vitest/src/metrics.js';
