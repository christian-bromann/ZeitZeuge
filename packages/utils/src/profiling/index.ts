/**
 * Shared profiling utilities for all test runner integrations.
 */

export { parseCpuProfile, type V8CpuProfile, type V8CpuProfileNode } from './profile-parser.js';

export { classifyScript, classifyScripts } from './classify.js';

export { mergeHotFunctions } from './merge-hot-functions.js';

export { computeMetrics, type HeapProfileWithAllocations } from './metrics.js';

export { createTestWorkspace } from './workspace.js';

export { analyzeTestPerformance } from './agent.js';

export {
  TEST_ORCHESTRATOR_SYSTEM_PROMPT,
  CPU_HOTSPOT_PROMPT,
  LISTENER_LEAK_PROMPT,
  MEMORY_CLOSURE_PROMPT,
  CODE_PATTERN_PROMPT,
  WORKSPACE_STRUCTURE,
  SEVERITY_RULES,
} from './prompts/index.js';
