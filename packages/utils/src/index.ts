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
