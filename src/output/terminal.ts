import pc from 'picocolors';
import ora, { type Ora } from 'ora';
import type { Finding, HeapSummary, TraceResult } from '../types.js';

const SEVERITY_ICONS: Record<Finding['severity'], string> = {
  critical: pc.red('🔴 CRITICAL'),
  warning: pc.yellow('🟡 WARNING'),
  info: pc.green('🟢 INFO'),
};

const SEVERITY_LABELS: Record<Finding['severity'], string> = {
  critical: pc.red('CRITICAL'),
  warning: pc.yellow('WARNING'),
  info: pc.green('INFO'),
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

/**
 * Print the zeitzeuge header with version and target URL.
 */
export function printHeader(url: string, version: string): void {
  const urlDisplay = url.length > 44 ? url.slice(0, 41) + '...' : url;
  console.log(
    pc.cyan(
      `\n┌${'─'.repeat(57)}┐\n` +
        `│  zeitzeuge v${version.padEnd(44)}│\n` +
        `│  Analyzing: ${urlDisplay.padEnd(44)}│\n` +
        `└${'─'.repeat(57)}┘\n`,
    ),
  );
}

/**
 * Create and start a spinner with the given text.
 */
export function createSpinner(text: string): Ora {
  return ora({ text, color: 'cyan' }).start();
}

/**
 * Print all findings to the terminal with formatting.
 */
export function printFindings(findings: Finding[]): void {
  console.log(pc.dim('\n' + '━'.repeat(58) + '\n'));

  if (findings.length === 0) {
    console.log(pc.green('  ✔ No significant performance issues found. Page looks healthy!\n'));
    console.log(pc.dim('━'.repeat(58)));
    return;
  }

  for (const finding of findings) {
    const icon = SEVERITY_ICONS[finding.severity];
    const categoryLabel = CATEGORY_LABELS[finding.category] ?? finding.category;
    console.log(`${icon} [${categoryLabel}]: ${pc.bold(finding.title)}`);

    // Show context-specific metadata
    if (finding.retainedSize != null) {
      console.log(pc.dim(`   Retained size: ${formatBytes(finding.retainedSize)}`));
    }
    if (finding.impactMs != null) {
      console.log(pc.dim(`   Impact: ${finding.impactMs.toFixed(0)}ms`));
    }
    if (finding.resourceUrl) {
      console.log(pc.dim(`   Resource: ${finding.resourceUrl}`));
    }
    if (finding.retainerPath && finding.retainerPath.length > 0) {
      console.log(pc.dim(`   Path: ${finding.retainerPath.join(' → ')}`));
    }
    if (finding.testFile) {
      console.log(pc.dim(`   Test file: ${finding.testFile}`));
    }
    if (finding.hotFunction) {
      const hf = finding.hotFunction;
      console.log(
        pc.dim(
          `   Function: ${hf.name} at ${hf.scriptUrl}:${hf.lineNumber} (selfTime: ${hf.selfTime.toFixed(0)}ms, ${hf.selfPercent.toFixed(1)}%)`,
        ),
      );
    }

    console.log(`\n   ${finding.description}\n`);

    if (finding.suggestedFix) {
      console.log(pc.dim('   Suggested fix:'));
      const lines = finding.suggestedFix.split('\n');
      const boxWidth = Math.max(...lines.map((l) => l.length), 20) + 4;
      console.log(pc.dim(`   ┌${'─'.repeat(boxWidth)}┐`));
      for (const line of lines) {
        console.log(pc.dim('   │ ') + pc.white(line.padEnd(boxWidth - 2)) + pc.dim(' │'));
      }
      console.log(pc.dim(`   └${'─'.repeat(boxWidth)}┘`));
    }

    console.log();
  }

  console.log(pc.dim('━'.repeat(58)));

  // Summary line
  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
  console.log(
    `\nSummary: ${pc.red(`${counts.critical} critical`)}, ` +
      `${pc.yellow(`${counts.warning} warning`)}, ` +
      `${pc.green(`${counts.info} info`)}\n`,
  );
}

function wrapText(text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const rawLine of text.split('\n')) {
    const words = rawLine.split(/\s+/).filter(Boolean);
    if (words.length === 0) {
      lines.push('');
      continue;
    }
    let current = '';
    for (const word of words) {
      const next = current ? `${current} ${word}` : word;
      if (next.length > maxWidth && current) {
        lines.push(current);
        current = word;
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines;
}

/**
 * Print findings in a compact format (optimized for Vitest logs).
 */
export function printFindingsVitest(findings: Finding[]): void {
  const indent = '  ';
  const subIndent = indent + '  ';

  if (findings.length === 0) {
    console.log(`${indent}${pc.green('✔')} No significant performance issues found.`);
    return;
  }

  for (const finding of findings) {
    const severity = SEVERITY_LABELS[finding.severity];
    const categoryLabel = CATEGORY_LABELS[finding.category] ?? finding.category;

    console.log(`${indent}${severity} [${categoryLabel}]: ${pc.bold(finding.title)}`);

    if (finding.testFile) console.log(pc.dim(`${subIndent}Test file: ${finding.testFile}`));
    if (finding.impactMs != null)
      console.log(pc.dim(`${subIndent}Impact: ${finding.impactMs.toFixed(0)}ms`));
    if (finding.resourceUrl) console.log(pc.dim(`${subIndent}Resource: ${finding.resourceUrl}`));
    if (finding.hotFunction) {
      const hf = finding.hotFunction;
      console.log(
        pc.dim(
          `${subIndent}Function: ${hf.name} at ${hf.scriptUrl}:${hf.lineNumber} (selfTime: ${hf.selfTime.toFixed(
            0,
          )}ms, ${hf.selfPercent.toFixed(1)}%)`,
        ),
      );
    }

    for (const line of wrapText(finding.description, 100)) {
      console.log(`${subIndent}${line}`);
    }

    if (finding.suggestedFix) {
      console.log(pc.dim(`${subIndent}Suggested fix:`));
      for (const line of finding.suggestedFix.split('\n')) {
        console.log(`${subIndent}  ${line}`);
      }
    }

    console.log();
  }

  const counts = {
    critical: findings.filter((f) => f.severity === 'critical').length,
    warning: findings.filter((f) => f.severity === 'warning').length,
    info: findings.filter((f) => f.severity === 'info').length,
  };
  console.log(
    `${indent}${pc.dim('Summary:')} ${pc.red(`${counts.critical} critical`)}, ${pc.yellow(
      `${counts.warning} warning`,
    )}, ${pc.green(`${counts.info} info`)}`,
  );
}

/**
 * Print capture info summary (heap + trace).
 */
export function printCaptureInfo(heapSummary: HeapSummary, trace: TraceResult): void {
  console.log(
    pc.dim(
      `Heap: ${formatBytes(heapSummary.metadata.totalSize)} | ` +
        `Nodes: ${heapSummary.metadata.nodeCount.toLocaleString()} | ` +
        `Requests: ${trace.networkRequests.length} | ` +
        `Long tasks: ${trace.metrics.longTasks.length}`,
    ),
  );
}

/**
 * Print snapshot metadata summary (legacy, kept for compatibility).
 */
export function printSnapshotInfo(summary: HeapSummary): void {
  console.log(
    pc.dim(
      `Heap size: ${formatBytes(summary.metadata.totalSize)} | ` +
        `Nodes: ${summary.metadata.nodeCount.toLocaleString()} | ` +
        `Edges: ${summary.metadata.edgeCount.toLocaleString()}`,
    ),
  );
}

/**
 * Print an error message to stderr.
 */
export function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(pc.red(`\n✖ Error: ${message}\n`));
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
