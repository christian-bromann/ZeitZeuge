import { writeFileSync } from 'node:fs';
import type { Finding, HeapSummary, TraceResult } from '../types.js';
import type { TestFileTiming, CorrelatedProfile } from '../vitest/types.js';
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
      if (f.impactMs != null) context.push(`${f.impactMs.toFixed(0)}ms impact`);
      if (f.retainedSize != null) context.push(`${formatBytes(f.retainedSize)} retained`);
      if (f.resourceUrl) context.push(`\`${f.resourceUrl}\``);
      sections.push(context.join(' · '));
      sections.push('');

      // What's wrong
      sections.push(f.description);
      sections.push('');

      // How to fix it
      if (f.suggestedFix) {
        sections.push(`### How to fix`);
        sections.push('');

        const looksLikeCode =
          f.suggestedFix.includes('{') ||
          f.suggestedFix.includes(';') ||
          f.suggestedFix.includes('=>') ||
          f.suggestedFix.includes('import ') ||
          f.suggestedFix.includes('function ');

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
  const { version, findings, testTiming, profiles } = options;
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
      if (f.impactMs != null) context.push(`${f.impactMs.toFixed(0)}ms impact`);
      if (f.testFile) context.push(`\`${f.testFile}\``);
      if (f.hotFunction) {
        context.push(
          `\`${f.hotFunction.name}\` (${f.hotFunction.selfTime.toFixed(0)}ms, ${f.hotFunction.selfPercent.toFixed(1)}%)`,
        );
      }
      if (f.resourceUrl) context.push(`\`${f.resourceUrl}\``);
      sections.push(context.join(' · '));
      sections.push('');

      // Description
      sections.push(f.description);
      sections.push('');

      // How to fix
      if (f.suggestedFix) {
        sections.push(`### How to fix`);
        sections.push('');

        const looksLikeCode =
          f.suggestedFix.includes('{') ||
          f.suggestedFix.includes(';') ||
          f.suggestedFix.includes('=>') ||
          f.suggestedFix.includes('import ') ||
          f.suggestedFix.includes('function ');

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
