/**
 * Finding deduplication and ranking for parallel subagent results.
 *
 * When multiple specialized subagents analyze the same codebase in parallel,
 * they may produce overlapping findings for the same function. This module
 * merges duplicates while preserving findings that describe genuinely
 * different issues (cross-category preservation).
 *
 * This module is domain-agnostic — it operates solely on the shared Finding
 * type and can be used by both the Vitest and CLI analysis agents.
 */

import type { Finding } from '../types.js';

// ── Function name extraction ────────────────────────────────

/**
 * Extract a likely function name from a finding's title and description.
 *
 * Looks for patterns like `functionName()`, `functionName`, or
 * camelCase identifiers mentioned in the text.
 */
export function extractFunctionName(finding: Finding): string | null {
  // 1. Check hotFunction field first
  if (finding.hotFunction?.name) {
    return finding.hotFunction.name;
  }

  const text = `${finding.title ?? ''} ${finding.description ?? ''}`;

  // 2. Match "functionName()" pattern (most specific)
  const callMatch = text.match(/\b([a-zA-Z_$][a-zA-Z0-9_$]*)\s*\(\)/);
  if (callMatch) return callMatch[1]!;

  // 3. Match "`functionName`" in backtick-quoted identifiers
  const backtickMatch = text.match(/`([a-zA-Z_$][a-zA-Z0-9_$]*)`/);
  if (backtickMatch) return backtickMatch[1]!;

  return null;
}

// ── Severity ordering ───────────────────────────────────────

const SEVERITY_ORDER: Record<string, number> = {
  critical: 0,
  warning: 1,
  info: 2,
};

const CONFIDENCE_ORDER: Record<string, number> = {
  high: 0,
  medium: 1,
  low: 2,
};

export function severityRank(s: string | undefined): number {
  return SEVERITY_ORDER[s ?? 'info'] ?? 3;
}

export function confidenceRank(c: string | undefined): number {
  return CONFIDENCE_ORDER[c ?? ''] ?? 3;
}

// ── Scoring for "best finding" selection ────────────────────

export function findingQualityScore(f: Finding): number {
  let score = 0;

  // Strongly prefer findings with both before and after code
  if (f.beforeCode && f.afterCode) score += 100;
  else if (f.beforeCode || f.afterCode) score += 30;

  // Higher confidence is better
  score += (3 - confidenceRank(f.confidence)) * 20;

  // Higher severity is better
  score += (3 - severityRank(f.severity)) * 15;

  // Longer description likely means more specific
  score += Math.min((f.description?.length ?? 0) / 50, 10);

  // Has source file
  if (f.sourceFile) score += 10;

  // Has line number
  if (f.lineNumber) score += 5;

  return score;
}

// ── Deduplication ───────────────────────────────────────────

/**
 * Deduplicate findings from multiple subagents.
 *
 * Groups by (sourceFile, functionName), then sub-groups by category.
 * Within each category sub-group, keeps only the highest-quality finding.
 * Findings with different categories for the same function are preserved
 * (cross-category preservation).
 *
 * Findings without a sourceFile or extractable function name are never
 * deduplicated — they pass through as-is.
 */
export function deduplicateFindings(findings: Finding[]): Finding[] {
  const ungroupable: Finding[] = [];
  const groups = new Map<string, Map<string, Finding[]>>();

  for (const finding of findings) {
    const funcName = extractFunctionName(finding);
    const sourceFile = finding.sourceFile ?? finding.workspacePath;

    // Can't group without both identifiers
    if (!sourceFile || !funcName) {
      ungroupable.push(finding);
      continue;
    }

    // Normalize source file for grouping
    const normalizedFile = sourceFile.toLowerCase().split('/').pop() ?? sourceFile;
    const groupKey = `${normalizedFile}::${funcName.toLowerCase()}`;
    const category = (finding.category ?? 'other').toLowerCase();

    if (!groups.has(groupKey)) {
      groups.set(groupKey, new Map());
    }
    const categoryMap = groups.get(groupKey)!;

    if (!categoryMap.has(category)) {
      categoryMap.set(category, []);
    }
    categoryMap.get(category)!.push(finding);
  }

  // Select best finding from each category sub-group
  const deduped: Finding[] = [...ungroupable];

  for (const categoryMap of groups.values()) {
    for (const candidatesInCategory of categoryMap.values()) {
      if (candidatesInCategory.length === 0) continue;

      // Pick the best finding by quality score
      let best = candidatesInCategory[0]!;
      let bestScore = findingQualityScore(best);

      for (let i = 1; i < candidatesInCategory.length; i++) {
        const score = findingQualityScore(candidatesInCategory[i]!);
        if (score > bestScore) {
          best = candidatesInCategory[i]!;
          bestScore = score;
        }
      }

      deduped.push(best);
    }
  }

  return deduped;
}

// ── Ranking ─────────────────────────────────────────────────

/**
 * Rank findings by severity (critical > warning > info), then by impactMs
 * descending, then by confidence (high > medium > low).
 *
 * Returns a new sorted array without mutating the input.
 */
export function rankFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    // 1. Severity: critical (0) > warning (1) > info (2)
    const sevDiff = severityRank(a.severity) - severityRank(b.severity);
    if (sevDiff !== 0) return sevDiff;

    // 2. impactMs descending (undefined treated as 0)
    const impactDiff = (b.impactMs ?? 0) - (a.impactMs ?? 0);
    if (impactDiff !== 0) return impactDiff;

    // 3. Confidence: high (0) > medium (1) > low (2)
    return confidenceRank(a.confidence) - confidenceRank(b.confidence);
  });
}
