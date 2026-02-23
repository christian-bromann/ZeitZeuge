/**
 * Deep Agent analysis — re-exports from the vitest package since the
 * analysis pipeline is shared across all test runner integrations.
 */
export {
  analyzeTestPerformance,
  type VitestAnalysisContext as BunTestAnalysisContext,
} from '../../vitest/src/agent.js';
