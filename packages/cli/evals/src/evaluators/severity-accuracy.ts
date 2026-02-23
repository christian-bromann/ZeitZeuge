/**
 * Severity Accuracy evaluator for CLI evals (deterministic).
 *
 * Compares the agent's severity assignment against the expected severity.
 * Scoring: exact match = 1.0, one level off = 0.5, two levels off = 0.0.
 */

import type { Finding } from '@zeitzeuge/utils';
import { REFERENCE_FINDINGS, type ReferenceFinding } from '../reference-findings.js';
import { computeCoverage } from './finding-coverage.js';

const SEVERITY_ORDER: Record<string, number> = {
  critical: 2,
  warning: 1,
  info: 0,
};

function severityScore(actual: string, expected: string): number {
  const actualLevel = SEVERITY_ORDER[actual] ?? -1;
  const expectedLevel = SEVERITY_ORDER[expected] ?? -1;

  if (actualLevel === -1 || expectedLevel === -1) return 0;

  const diff = Math.abs(actualLevel - expectedLevel);
  if (diff === 0) return 1.0;
  if (diff === 1) return 0.5;
  return 0.0;
}

export function computeSeverityAccuracy(
  findings: Finding[],
  referenceFindings: ReferenceFinding[] = REFERENCE_FINDINGS,
): Record<string, number> {
  const coverage = computeCoverage(findings, referenceFindings);
  const matchedRefIds = new Set(coverage.matchedFindings);

  if (matchedRefIds.size === 0) {
    return { severity_accuracy: 0 };
  }

  let totalScore = 0;
  let count = 0;

  for (const ref of referenceFindings) {
    if (!matchedRefIds.has(ref.id)) continue;

    let bestFinding: Finding | null = null;
    let bestScore = 0;

    for (const finding of findings) {
      let score = 0;
      const sfNorm = (
        finding.sourceFile ??
        finding.workspacePath ??
        finding.resourceUrl ??
        ''
      ).toLowerCase();
      if (sfNorm.includes(ref.sourceFile.toLowerCase())) score += 2;
      const text = `${finding.title ?? ''} ${finding.description ?? ''}`.toLowerCase();
      for (const kw of ref.keywords) {
        if (text.includes(kw.toLowerCase())) score += 0.5;
      }
      if (score > bestScore) {
        bestScore = score;
        bestFinding = finding;
      }
    }

    if (bestFinding) {
      totalScore += severityScore(bestFinding.severity, ref.expectedSeverity);
      count++;
    }
  }

  return {
    severity_accuracy: count > 0 ? totalScore / count : 0,
  };
}
