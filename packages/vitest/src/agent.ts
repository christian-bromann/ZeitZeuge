/**
 * Deep Agent analysis for Vitest — delegates to the shared implementation
 * in @zeitzeuge/utils. Re-exports for backward compatibility.
 */

export {
  analyzeTestPerformance,
  type TestAnalysisContext as VitestAnalysisContext,
} from '@zeitzeuge/utils';
