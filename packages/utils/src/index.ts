/**
 * @zeitzeuge/utils — shared utilities for zeitzeuge packages.
 *
 * This package is private and never published to npm. Its code is
 * bundled into consuming packages (zeitzeuge CLI, @zeitzeuge/vitest)
 * at build time via `bun build --packages external`.
 */

// ── Types & schemas ──
export * from './types.js';
export { FindingSchema, FindingsSchema, ALL_CATEGORIES } from './schema.js';

// ── Models ──
export { initModel } from './models/init.js';

// ── Analysis ──
export { invokeWithTodoStreaming } from './analysis/agent.js';
export {
  deduplicateFindings,
  rankFindings,
  extractFunctionName,
  findingQualityScore,
  severityRank,
  confidenceRank,
} from './analysis/deduplication.js';

// ── Prompts ──
export {
  VERIFICATION_RULES,
  OUTPUT_FORMAT,
  FINDING_CATEGORIES,
  PARALLEL_TOOL_CALLS,
  FULL_RESPONSE_REQUIREMENT,
  STRUCTURED_OUTPUT_FIELDS,
} from './prompts/shared.js';
export {
  buildFileListPromptSection,
  insertFileListIntoPrompt,
  type FileListConfig,
  type FileListEntry,
} from './prompts/file-list.js';

// ── Workspace ──
export {
  createWorkspaceFromFiles,
  listWorkspaceFiles,
  type WorkspaceBuilderResult,
} from './workspace/builder.js';

// ── Skills ──
export {
  DATA_SCRIPTING_SKILL_FILES,
  BROWSER_ANALYSIS_SKILL_FILES,
  PROFILE_ANALYSIS_SKILL_FILES,
} from './skills/index.js';

// ── Profiling ──
export {
  parseCpuProfile,
  classifyScript,
  classifyScripts,
  mergeHotFunctions,
  computeMetrics,
  createTestWorkspace,
  analyzeTestPerformance,
  TEST_ORCHESTRATOR_SYSTEM_PROMPT,
  CPU_HOTSPOT_PROMPT,
  LISTENER_LEAK_PROMPT,
  MEMORY_CLOSURE_PROMPT,
  CODE_PATTERN_PROMPT,
  WORKSPACE_STRUCTURE,
  SEVERITY_RULES,
  type V8CpuProfile,
  type V8CpuProfileNode,
  type HeapProfileWithAllocations,
} from './profiling/index.js';

// ── Output ──
export { TodoProgressRenderer, type ChunkMeta } from './output/progress.js';
export {
  printFindings,
  printFindingsVitest,
  printMetricsSummary,
  printHeader,
  printCaptureInfo,
  printSnapshotInfo,
  printError,
  createSpinner,
  formatBytes,
} from './output/terminal.js';
export {
  writeReport,
  generateMarkdown,
  writeTestReport,
  generateTestMarkdown,
  type ReportOptions,
  type TestReportOptions,
} from './output/report.js';
