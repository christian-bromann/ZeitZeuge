/**
 * Performance metrics computation — re-exports from the vitest package.
 *
 * The metrics computation is identical regardless of which test runner
 * produced the data (same TestFileTiming and CorrelatedProfile shapes).
 *
 * Note: This module is imported from the vitest package because the
 * metrics computation logic depends on workspace/mergeHotFunctions
 * which is not yet extracted into @zeitzeuge/utils.
 */
export { computeMetrics } from '../../vitest/src/metrics.js';
