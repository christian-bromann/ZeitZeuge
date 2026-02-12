import chalk from "chalk";
import ora, { type Ora } from "ora";
import type { Finding, HeapSummary, TraceResult } from "../types.js";

const SEVERITY_ICONS: Record<Finding["severity"], string> = {
  critical: chalk.red("🔴 CRITICAL"),
  warning: chalk.yellow("🟡 WARNING"),
  info: chalk.green("🟢 INFO"),
};

const CATEGORY_LABELS: Record<string, string> = {
  "memory-leak": "Memory Leak",
  "large-retained-object": "Large Retained Object",
  "detached-dom": "Detached DOM",
  "render-blocking": "Render-Blocking",
  "long-task": "Long Task",
  "unused-code": "Unused Code",
  "waterfall-bottleneck": "Waterfall Bottleneck",
  "large-asset": "Large Asset",
  "frame-blocking-function": "Frame-Blocking Function",
  "listener-leak": "Listener Leak",
  "gc-pressure": "GC Pressure",
  other: "Other",
};

/**
 * Print the perfagent header with version and target URL.
 */
export function printHeader(url: string, version: string): void {
  const urlDisplay = url.length > 44 ? url.slice(0, 41) + "..." : url;
  console.log(
    chalk.cyan(
      `\n┌${"─".repeat(57)}┐\n` +
        `│  perfagent v${version.padEnd(44)}│\n` +
        `│  Analyzing: ${urlDisplay.padEnd(44)}│\n` +
        `└${"─".repeat(57)}┘\n`
    )
  );
}

/**
 * Create and start a spinner with the given text.
 */
export function createSpinner(text: string): Ora {
  return ora({ text, color: "cyan" }).start();
}

/**
 * Print all findings to the terminal with formatting.
 */
export function printFindings(findings: Finding[]): void {
  console.log(chalk.dim("\n" + "━".repeat(58) + "\n"));

  if (findings.length === 0) {
    console.log(
      chalk.green(
        "  ✔ No significant performance issues found. Page looks healthy!\n"
      )
    );
    console.log(chalk.dim("━".repeat(58)));
    return;
  }

  for (const finding of findings) {
    const icon = SEVERITY_ICONS[finding.severity];
    const categoryLabel = CATEGORY_LABELS[finding.category] ?? finding.category;
    console.log(`${icon} [${categoryLabel}]: ${chalk.bold(finding.title)}`);

    // Show context-specific metadata
    if (finding.retainedSize != null) {
      console.log(
        chalk.dim(`   Retained size: ${formatBytes(finding.retainedSize)}`)
      );
    }
    if (finding.impactMs != null) {
      console.log(
        chalk.dim(`   Impact: ${finding.impactMs.toFixed(0)}ms`)
      );
    }
    if (finding.resourceUrl) {
      console.log(chalk.dim(`   Resource: ${finding.resourceUrl}`));
    }
    if (finding.retainerPath && finding.retainerPath.length > 0) {
      console.log(
        chalk.dim(`   Path: ${finding.retainerPath.join(" → ")}`)
      );
    }

    console.log(`\n   ${finding.description}\n`);

    if (finding.suggestedFix) {
      console.log(chalk.dim("   Suggested fix:"));
      const lines = finding.suggestedFix.split("\n");
      const boxWidth = Math.max(...lines.map((l) => l.length), 20) + 4;
      console.log(chalk.dim(`   ┌${"─".repeat(boxWidth)}┐`));
      for (const line of lines) {
        console.log(
          chalk.dim("   │ ") +
            chalk.white(line.padEnd(boxWidth - 2)) +
            chalk.dim(" │")
        );
      }
      console.log(chalk.dim(`   └${"─".repeat(boxWidth)}┘`));
    }

    console.log();
  }

  console.log(chalk.dim("━".repeat(58)));

  // Summary line
  const counts = {
    critical: findings.filter((f) => f.severity === "critical").length,
    warning: findings.filter((f) => f.severity === "warning").length,
    info: findings.filter((f) => f.severity === "info").length,
  };
  console.log(
    `\nSummary: ${chalk.red(`${counts.critical} critical`)}, ` +
      `${chalk.yellow(`${counts.warning} warning`)}, ` +
      `${chalk.green(`${counts.info} info`)}\n`
  );
}

/**
 * Print capture info summary (heap + trace).
 */
export function printCaptureInfo(
  heapSummary: HeapSummary,
  trace: TraceResult
): void {
  console.log(
    chalk.dim(
      `Heap: ${formatBytes(heapSummary.metadata.totalSize)} | ` +
        `Nodes: ${heapSummary.metadata.nodeCount.toLocaleString()} | ` +
        `Requests: ${trace.networkRequests.length} | ` +
        `Long tasks: ${trace.metrics.longTasks.length}`
    )
  );
}

/**
 * Print snapshot metadata summary (legacy, kept for compatibility).
 */
export function printSnapshotInfo(summary: HeapSummary): void {
  console.log(
    chalk.dim(
      `Heap size: ${formatBytes(summary.metadata.totalSize)} | ` +
        `Nodes: ${summary.metadata.nodeCount.toLocaleString()} | ` +
        `Edges: ${summary.metadata.edgeCount.toLocaleString()}`
    )
  );
}

/**
 * Print an error message to stderr.
 */
export function printError(err: unknown): void {
  const message = err instanceof Error ? err.message : String(err);
  console.error(chalk.red(`\n✖ Error: ${message}\n`));
}

/**
 * Format bytes into a human-readable string.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
