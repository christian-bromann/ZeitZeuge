/**
 * Deep Agent analysis for Node.js test runner — delegates to the shared
 * vitest agent since the analysis pipeline is identical.
 */
export {
  analyzeTestPerformance,
  type VitestAnalysisContext as NodeTestAnalysisContext,
} from '../../vitest/src/agent.js';
