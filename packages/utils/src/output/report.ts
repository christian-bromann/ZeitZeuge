import { writeFileSync } from 'node:fs';
import type {
  Finding,
  HeapSummary,
  TraceResult,
  TestFileTiming,
  CorrelatedProfile,
  PerformanceMetrics,
  ScreencastFrame,
  RenderingDiagnostic,
} from '../types.js';
import { getListenerImbalances } from '../types.js';
import { formatBytes } from './terminal.js';

const SEVERITY_EMOJI: Record<Finding['severity'], string> = {
  critical: '🔴',
  warning: '🟡',
  info: 'ℹ️',
};

const CATEGORY_LABELS: Record<string, string> = {
  'memory-leak': 'Memory Leak',
  'large-retained-object': 'Large Retained Object',
  'detached-dom': 'Detached DOM',
  'render-blocking': 'Render-Blocking',
  'long-task': 'Long Task',
  'unused-code': 'Unused Code',
  'waterfall-bottleneck': 'Waterfall Bottleneck',
  'large-asset': 'Large Asset',
  'frame-blocking-function': 'Frame-Blocking Function',
  'listener-leak': 'Listener Leak',
  'gc-pressure': 'GC Pressure',
  'slow-test': 'Slow Test',
  'expensive-setup': 'Expensive Setup',
  'hot-function': 'Hot Function',
  'unnecessary-computation': 'Unnecessary Computation',
  'import-overhead': 'Import Overhead',
  'dependency-bottleneck': 'Dependency Bottleneck',
  algorithm: 'Inefficient Algorithm',
  serialization: 'Serialization Overhead',
  allocation: 'Excessive Allocation',
  'event-handling': 'Event Handling',
  'blocking-io': 'Blocking I/O',
  other: 'Other',
};

export interface ReportOptions {
  url: string;
  version: string;
  findings: Finding[];
  heapSummary: HeapSummary;
  trace: TraceResult;
}

export interface TestReportOptions {
  version: string;
  findings: Finding[];
  testTiming: TestFileTiming[];
  profiles: CorrelatedProfile[];
  metrics?: PerformanceMetrics;
}

/**
 * Generate a Markdown performance report and write it to disk.
 * Returns the absolute path of the written file.
 */
export function writeReport(outputPath: string, options: ReportOptions): string {
  const md = generateMarkdown(options);
  writeFileSync(outputPath, md, 'utf-8');
  return outputPath;
}

/**
 * Generate the full Markdown report string.
 *
 * The report is focused on actionable findings — what's wrong and how
 * to fix it. Raw metrics are kept to a one-line health snapshot so
 * the reader can jump straight to the issues that matter.
 */
export function generateMarkdown(options: ReportOptions): string {
  const { url, version, findings, heapSummary, trace } = options;
  const now = new Date();

  const sections: string[] = [];

  // ── Header ──
  sections.push(`# Performance Report`);
  sections.push('');
  sections.push(
    `> **${url}** — analyzed ${now.toISOString().replace('T', ' ').slice(0, 16)} UTC by zeitzeuge v${version}`,
  );
  sections.push('');

  // ── Health snapshot (one line, not a table) ──
  const totalTransfer = trace.networkRequests.reduce((s, r) => s + r.encodedSize, 0);
  const loadSec = (trace.metrics.loadComplete / 1000).toFixed(1);
  const fcpSec = (trace.metrics.firstContentfulPaint / 1000).toFixed(2);
  const tbt = trace.metrics.totalBlockingTime.toFixed(0);
  const heapSize = formatBytes(heapSummary.metadata.totalSize);
  const reqCount = trace.networkRequests.length;

  sections.push(
    `**Page load** ${loadSec}s · **FCP** ${fcpSec}s · **TBT** ${tbt}ms · ` +
      `**Heap** ${heapSize} · **${reqCount} requests** (${formatBytes(totalTransfer)} transferred)`,
  );
  sections.push('');

  // ── Rendering filmstrip & diagnostics ──
  if (trace.renderingDiagnostic) {
    sections.push(
      ...generateFilmstripSection(trace.renderingDiagnostic, trace.screencastFrames ?? []),
    );
  }

  // ── Summary ──
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  if (findings.length === 0) {
    sections.push(`## ✅ No issues found`);
    sections.push('');
    sections.push(
      `No significant performance problems were detected. ` +
        `The page loads in ${loadSec}s with ${tbt}ms of total blocking time — looking healthy.`,
    );
    sections.push('');
  } else {
    sections.push(
      `**${findings.length} issues found** — ` +
        `${counts.critical} critical, ${counts.warning} warning, ${counts.info} info`,
    );
    sections.push('');

    // ── Findings ──
    for (let i = 0; i < findings.length; i++) {
      const f = findings[i];
      if (!f) continue;
      const emoji = SEVERITY_EMOJI[f.severity];
      const categoryLabel = CATEGORY_LABELS[f.category] ?? f.category;

      sections.push(`---`);
      sections.push('');
      sections.push(`## ${emoji} ${f.title}`);
      sections.push('');

      // One-line context: category + key metric
      const context: string[] = [`**${categoryLabel}**`];
      if (f.confidence) context.push(`confidence: ${f.confidence}`);
      if (f.impactMs != null) context.push(`${f.impactMs.toFixed(0)}ms impact`);
      if (f.estimatedSavingsMs != null)
        context.push(`~${f.estimatedSavingsMs.toFixed(0)}ms savings`);
      if (f.retainedSize != null) context.push(`${formatBytes(f.retainedSize)} retained`);
      if (f.sourceFile)
        context.push(`\`${f.sourceFile}${f.lineNumber != null ? `:${f.lineNumber}` : ''}\``);
      if (f.resourceUrl) context.push(`\`${f.resourceUrl}\``);
      sections.push(context.join(' · '));
      sections.push('');

      // What's wrong
      sections.push(f.description);
      sections.push('');

      // Before/after code snippets (structured)
      if (f.beforeCode || f.afterCode) {
        if (f.beforeCode) {
          sections.push(`### Before`);
          sections.push('');
          sections.push('```js');
          sections.push(f.beforeCode);
          sections.push('```');
          sections.push('');
        }
        if (f.afterCode) {
          sections.push(`### After`);
          sections.push('');
          sections.push('```js');
          sections.push(f.afterCode);
          sections.push('```');
          sections.push('');
        }
      }

      // How to fix it (freeform)
      if (f.suggestedFix) {
        sections.push(`### How to fix`);
        sections.push('');

        const alreadyFenced = f.suggestedFix.includes('```');
        const looksLikeCode =
          !alreadyFenced &&
          (f.suggestedFix.includes('{') ||
            f.suggestedFix.includes(';') ||
            f.suggestedFix.includes('=>') ||
            f.suggestedFix.includes('import ') ||
            f.suggestedFix.includes('function '));

        if (looksLikeCode) {
          sections.push('```js');
          sections.push(f.suggestedFix);
          sections.push('```');
        } else {
          sections.push(f.suggestedFix);
        }
        sections.push('');
      }

      // Retention path — only when relevant
      if (f.retainerPath && f.retainerPath.length > 0) {
        sections.push(`*Retention path:* ${f.retainerPath.map((p) => `\`${p}\``).join(' → ')}`);
        sections.push('');
      }
    }
  }

  // ── Footer ──
  sections.push(`---`);
  sections.push('');
  sections.push(`*Generated by zeitzeuge v${version}*`);
  sections.push('');

  return sections.join('\n');
}

// ── Test Performance Report ──────────────────────────────────

/**
 * Generate a Markdown report for Vitest test performance and write it to disk.
 * Returns the absolute path of the written file.
 */
export function writeTestReport(outputPath: string, options: TestReportOptions): string {
  const md = generateTestMarkdown(options);
  writeFileSync(outputPath, md, 'utf-8');
  return outputPath;
}

/**
 * Generate the full Markdown report string for Vitest test performance.
 */
export function generateTestMarkdown(options: TestReportOptions): string {
  const { version, findings, testTiming, profiles, metrics } = options;
  const now = new Date();

  const sections: string[] = [];

  // ── Header ──
  sections.push(`# Vitest Performance Report`);
  sections.push('');
  sections.push(
    `> Analyzed ${now.toISOString().replace('T', ' ').slice(0, 16)} UTC by zeitzeuge v${version}`,
  );
  sections.push('');

  // ── Test run summary ──
  const totalTests = testTiming.reduce((s, t) => s + t.testCount, 0);
  const totalFiles = testTiming.length;
  const totalDuration = testTiming.reduce((s, t) => s + t.duration, 0);
  const slowest =
    testTiming.length > 0 ? testTiming.reduce((a, b) => (a.duration > b.duration ? a : b)) : null;
  const totalGcTime = profiles.reduce(
    (s, p) => s + (p.summary.duration * p.summary.gcPercentage) / 100,
    0,
  );
  const gcPercentage = totalDuration > 0 ? ((totalGcTime / totalDuration) * 100).toFixed(2) : '0';

  sections.push(
    `**Test run** ${totalTests} tests across ${totalFiles} files · ` +
      `**Total duration** ${(totalDuration / 1000).toFixed(2)}s · ` +
      `**Slowest file** ${slowest ? `${slowest.file} (${(slowest.duration / 1000).toFixed(2)}s)` : '—'} · ` +
      `**GC overhead** ${gcPercentage}% (${totalGcTime.toFixed(0)}ms)`,
  );
  sections.push('');

  // ── Performance Metrics ──
  if (metrics) {
    sections.push(`## Performance Metrics`);
    sections.push('');

    // Suite metrics table
    sections.push(`| Metric | Value |`);
    sections.push(`|--------|-------|`);
    sections.push(`| Total Duration | ${fmtMs(metrics.suite.totalDuration)} |`);
    sections.push(
      `| Tests | ${metrics.suite.totalTests} (${metrics.suite.passCount} pass, ${metrics.suite.failCount} fail) |`,
    );
    sections.push(`| Setup Time | ${fmtMs(metrics.suite.totalSetupTime)} |`);
    sections.push(`| Avg Test Duration | ${fmtMs(metrics.suite.averageTestDuration)} |`);
    sections.push(`| Median Test Duration | ${fmtMs(metrics.suite.medianTestDuration)} |`);
    sections.push(`| P95 Test Duration | ${fmtMs(metrics.suite.p95TestDuration)} |`);
    sections.push(
      `| Slowest Test | ${fmtMs(metrics.suite.slowestTestDuration)} (\`${metrics.suite.slowestTestName}\`) |`,
    );
    sections.push('');

    // CPU breakdown
    if (metrics.cpu.applicationTime > 0 || metrics.cpu.gcTime > 0) {
      sections.push(`### CPU Time Breakdown`);
      sections.push('');
      sections.push(`| Category | Time | % |`);
      sections.push(`|----------|------|---|`);
      sections.push(
        `| Application Code | ${fmtMs(metrics.cpu.applicationTime)} | ${metrics.cpu.applicationPercent}% |`,
      );
      sections.push(
        `| Dependencies | ${fmtMs(metrics.cpu.dependencyTime)} | ${metrics.cpu.dependencyPercent}% |`,
      );
      sections.push(
        `| Test/Framework | ${fmtMs(metrics.cpu.testFrameworkTime)} | ${metrics.cpu.testFrameworkPercent}% |`,
      );
      sections.push(`| GC | ${fmtMs(metrics.cpu.gcTime)} | ${metrics.cpu.gcPercentage}% |`);
      sections.push(`| Idle | ${fmtMs(metrics.cpu.idleTime)} | ${metrics.cpu.idlePercentage}% |`);
      sections.push('');
    }

    // Hot functions
    if (metrics.hotFunctions.length > 0) {
      sections.push(`### Top Hot Functions`);
      sections.push('');
      sections.push(`| Function | Self Time | % | Category |`);
      sections.push(`|----------|-----------|---|----------|`);
      for (const fn of metrics.hotFunctions.slice(0, 10)) {
        sections.push(
          `| \`${fn.functionName}\` | ${fmtMs(fn.selfTime)} | ${fn.selfPercent}% | ${fn.sourceCategory} |`,
        );
      }
      sections.push('');
    }

    // Event Listener Tracking
    if (metrics.listenerTracking) {
      const lt = metrics.listenerTracking;
      const hasExceedances = lt.exceedances.length > 0;
      const allImbalances = getListenerImbalances(lt);

      if (hasExceedances || allImbalances.length > 0) {
        sections.push(`### Event Listener Tracking`);
        sections.push('');

        if (hasExceedances) {
          sections.push(
            `**Listener exceedances detected** — one or more EventTarget/EventEmitter ` +
              `instances accumulated more listeners than their \`maxListeners\` threshold. ` +
              `This is a strong signal of a listener leak that can cause memory growth.`,
          );
          sections.push('');
          sections.push(`| Target | Event | Listeners | Threshold |`);
          sections.push(`|--------|-------|-----------|-----------|`);
          for (const exc of lt.exceedances) {
            sections.push(
              `| \`${exc.targetType}\` | \`${exc.eventType}\` | ${exc.listenerCount} | ${exc.threshold} |`,
            );
          }
          sections.push('');
        }

        if (allImbalances.length > 0) {
          sections.push(`**Listener imbalances:**`);
          sections.push('');
          sections.push(`| API | Event | Adds | Removes | Not Cleaned Up |`);
          sections.push(`|-----|-------|------|---------|----------------|`);
          for (const entry of allImbalances) {
            const leaked = entry.addCount - entry.removeCount;
            sections.push(
              `| ${entry.api} | \`${entry.type}\` | ${entry.addCount} | ${entry.removeCount} | ${leaked} |`,
            );
          }
          sections.push('');
        }
      }
    }
  }

  // ── Summary ──
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };

  if (findings.length === 0) {
    sections.push(`## ✅ No issues found`);
    sections.push('');
    sections.push(
      `No significant performance problems were detected. ` +
        `Tests complete in ${(totalDuration / 1000).toFixed(2)}s — looking healthy.`,
    );
    sections.push('');
  } else {
    sections.push(
      `**${findings.length} issues found** — ` +
        `${counts.critical} critical, ${counts.warning} warning, ${counts.info} info`,
    );
    sections.push('');

    // ── Findings ──
    for (const f of findings) {
      const emoji = SEVERITY_EMOJI[f.severity];
      const categoryLabel = CATEGORY_LABELS[f.category] ?? f.category;

      sections.push(`---`);
      sections.push('');
      sections.push(`## ${emoji} ${f.title}`);
      sections.push('');

      // Context line
      const context: string[] = [`**${categoryLabel}**`];
      if (f.confidence) context.push(`confidence: ${f.confidence}`);
      if (f.impactMs != null) context.push(`${f.impactMs.toFixed(0)}ms impact`);
      if (f.estimatedSavingsMs != null)
        context.push(`~${f.estimatedSavingsMs.toFixed(0)}ms savings`);
      if (f.testFile) context.push(`\`${f.testFile}\``);
      if (f.hotFunction) {
        context.push(
          `\`${f.hotFunction.name}\` (${f.hotFunction.selfTime.toFixed(0)}ms, ${f.hotFunction.selfPercent.toFixed(1)}%)`,
        );
      }
      if (f.sourceFile)
        context.push(`\`${f.sourceFile}${f.lineNumber != null ? `:${f.lineNumber}` : ''}\``);
      if (f.resourceUrl) context.push(`\`${f.resourceUrl}\``);
      sections.push(context.join(' · '));
      sections.push('');

      // Affected tests
      if (f.affectedTests && f.affectedTests.length > 0) {
        sections.push(`**Affected tests:** ${f.affectedTests.map((t) => `\`${t}\``).join(', ')}`);
        sections.push('');
      }

      // Description
      sections.push(f.description);
      sections.push('');

      // Before/after code snippets (structured)
      if (f.beforeCode || f.afterCode) {
        if (f.beforeCode) {
          sections.push(`### Before`);
          sections.push('');
          sections.push('```ts');
          sections.push(f.beforeCode);
          sections.push('```');
          sections.push('');
        }
        if (f.afterCode) {
          sections.push(`### After`);
          sections.push('');
          sections.push('```ts');
          sections.push(f.afterCode);
          sections.push('```');
          sections.push('');
        }
      }

      // How to fix (freeform)
      if (f.suggestedFix) {
        sections.push(`### How to fix`);
        sections.push('');

        const alreadyFenced = f.suggestedFix.includes('```');
        const looksLikeCode =
          !alreadyFenced &&
          (f.suggestedFix.includes('{') ||
            f.suggestedFix.includes(';') ||
            f.suggestedFix.includes('=>') ||
            f.suggestedFix.includes('import ') ||
            f.suggestedFix.includes('function '));

        if (looksLikeCode) {
          sections.push('```ts');
          sections.push(f.suggestedFix);
          sections.push('```');
        } else {
          sections.push(f.suggestedFix);
        }
        sections.push('');
      }
    }
  }

  // ── Footer ──
  sections.push(`---`);
  sections.push('');
  sections.push(`*Generated by zeitzeuge v${version}*`);
  sections.push('');

  return sections.join('\n');
}

// ── Rendering filmstrip helpers ──────────────────────────────

/**
 * Maximum number of filmstrip frames to embed in the report.
 * We select key frames (visual changes) rather than dumping every frame.
 */
const MAX_FILMSTRIP_FRAMES = 10;

/**
 * Select the most meaningful frames for the filmstrip: the first frame,
 * all visual-change frames, and the last frame. Caps at MAX_FILMSTRIP_FRAMES.
 */
function selectKeyFrames(
  diagnostic: RenderingDiagnostic,
  frames: ScreencastFrame[],
): ScreencastFrame[] {
  if (frames.length === 0) return [];

  const changeIndices = new Set(diagnostic.visualChanges.map((vc) => vc.frameIndex));
  changeIndices.add(0);
  changeIndices.add(frames.length - 1);

  const selected = [...changeIndices]
    .sort((a, b) => a - b)
    .filter((i) => i >= 0 && i < frames.length)
    .map((i) => frames[i]!);

  if (selected.length <= MAX_FILMSTRIP_FRAMES) return selected;

  const step = Math.ceil(selected.length / MAX_FILMSTRIP_FRAMES);
  const sampled: ScreencastFrame[] = [];
  for (let i = 0; i < selected.length; i += step) {
    sampled.push(selected[i]!);
  }
  if (sampled[sampled.length - 1] !== selected[selected.length - 1]) {
    sampled.push(selected[selected.length - 1]!);
  }
  return sampled.slice(0, MAX_FILMSTRIP_FRAMES);
}

/**
 * Generate the rendering filmstrip section for the markdown report.
 *
 * Embeds key screencast frames as base64 data-URI images in a table,
 * followed by rendering phases and FCP bottleneck summaries.
 */
function generateFilmstripSection(
  diagnostic: RenderingDiagnostic,
  frames: ScreencastFrame[],
): string[] {
  const sections: string[] = [];

  sections.push(`## Rendering Filmstrip`);
  sections.push('');

  const speedIdx = diagnostic.speedIndex;
  const fcpTs = diagnostic.fcpCorrelation.fcpTimestamp;
  sections.push(`**Speed Index** ${speedIdx}ms · **FCP** ${fcpTs}ms`);
  sections.push('');

  // ── Filmstrip frames as inline images ──
  const keyFrames = selectKeyFrames(diagnostic, frames);

  if (keyFrames.length > 0) {
    const headerCells = keyFrames.map((f) => `${Math.round(f.timestamp)}ms`).join(' | ');
    const separatorCells = keyFrames.map(() => ':---:').join(' | ');
    const imageCells = keyFrames
      .map(
        (f) =>
          `<img src="data:image/jpeg;base64,${f.data}" width="120" alt="${Math.round(f.timestamp)}ms" />`,
      )
      .join(' | ');

    sections.push(`| ${headerCells} |`);
    sections.push(`| ${separatorCells} |`);
    sections.push(`| ${imageCells} |`);
    sections.push('');
  }

  // ── Visual progress ──
  if (diagnostic.visualChanges.length > 0) {
    sections.push(`### Visual Progress`);
    sections.push('');
    sections.push(`| Time | Visual Completeness |`);
    sections.push(`|------|:-------------------:|`);
    for (const vc of diagnostic.visualChanges) {
      const bar =
        '█'.repeat(Math.round(vc.visualCompleteness / 5)) +
        '░'.repeat(20 - Math.round(vc.visualCompleteness / 5));
      sections.push(`| ${Math.round(vc.timestamp)}ms | ${bar} ${vc.visualCompleteness}% |`);
    }
    sections.push('');
  }

  // ── Rendering phases ──
  if (diagnostic.renderingPhases.length > 0) {
    sections.push(`### Rendering Phases`);
    sections.push('');
    sections.push(`| Phase | Duration | Description |`);
    sections.push(`|-------|----------|-------------|`);
    for (const phase of diagnostic.renderingPhases) {
      sections.push(`| ${phase.name} | ${phase.duration}ms | ${phase.description} |`);
    }
    sections.push('');
  }

  // ── FCP bottlenecks ──
  if (diagnostic.fcpBottlenecks.length > 0) {
    sections.push(`### FCP Bottlenecks`);
    sections.push('');
    sections.push(`| Type | Estimated Delay | Description |`);
    sections.push(`|------|:---------------:|-------------|`);
    for (const b of diagnostic.fcpBottlenecks) {
      const typeLabel = b.type.replace(/-/g, ' ');
      sections.push(`| ${typeLabel} | ${b.estimatedDelayMs}ms | ${b.description} |`);
    }
    sections.push('');
  }

  return sections;
}

// ── Markdown helpers ─────────────────────────────────────────

function fmtMs(ms: number): string {
  if (ms < 1) return `${(ms * 1000).toFixed(0)}µs`;
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}
