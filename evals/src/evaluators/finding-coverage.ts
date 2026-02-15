/**
 * Finding Coverage evaluator (deterministic).
 *
 * Measures what fraction of known performance flaws the agent detected.
 * Uses a 2-of-3 matching algorithm (source file, category, keywords)
 * to map agent findings to reference findings.
 */

import { REFERENCE_FINDINGS, type FlawCategory } from '../reference-findings.js';
import type { Finding } from '@zeitzeuge/utils';

// ── Types ────────────────────────────────────────────────────

export interface CoverageResult {
  blockingCoverage: number;
  listenerLeakCoverage: number;
  slowCodePathCoverage: number;
  closureLeakCoverage: number;
  excessiveInstantiationCoverage: number;
  overallCoverage: number;
  matchedFindings: string[];
  missedFindings: string[];
  falsePositives: number;
}

interface MatchCandidate {
  refId: string;
  findingIdx: number;
  score: number;
}

// ── Matching helpers ─────────────────────────────────────────

/**
 * Check if the agent finding's sourceFile matches the reference sourceFile.
 * Uses fuzzy matching: basename or partial path match.
 */
function matchesSourceFile(agentSourceFile: string | undefined, refSourceFile: string): boolean {
  if (!agentSourceFile) return false;
  const normalized = agentSourceFile.toLowerCase();
  const refNorm = refSourceFile.toLowerCase();

  // Exact suffix match (e.g. "src/utils/crypto.ts" matches "/src/utils/crypto.ts")
  if (normalized.endsWith(refNorm)) return true;

  // Basename match
  const agentBasename = normalized.split('/').pop() ?? '';
  const refBasename = refNorm.split('/').pop() ?? '';
  if (agentBasename && agentBasename === refBasename) return true;

  // Partial path match (the reference path appears somewhere in the agent path)
  if (normalized.includes(refNorm)) return true;

  return false;
}

/**
 * Check if the agent finding's category matches any of the expected categories.
 */
function matchesCategory(agentCategory: string | undefined, expectedCategories: string[]): boolean {
  if (!agentCategory) return false;
  return expectedCategories.some(
    (expected) => agentCategory.toLowerCase() === expected.toLowerCase(),
  );
}

/**
 * Check if the agent finding's title or description contains any reference keywords.
 * Returns the number of keyword matches (for scoring).
 */
function countKeywordMatches(finding: Finding, keywords: string[]): number {
  const text = `${finding.title ?? ''} ${finding.description ?? ''}`.toLowerCase();
  let matches = 0;
  for (const kw of keywords) {
    if (text.includes(kw.toLowerCase())) {
      matches++;
    }
  }
  return matches;
}

// ── Main evaluator ───────────────────────────────────────────

/**
 * Compute finding coverage: map agent findings to reference findings
 * using the 2-of-3 matching algorithm.
 */
export function computeCoverage(findings: Finding[]): CoverageResult {
  const candidates: MatchCandidate[] = [];

  // Score every (finding, reference) pair
  for (let fi = 0; fi < findings.length; fi++) {
    const finding = findings[fi]!;

    for (const ref of REFERENCE_FINDINGS) {
      let signals = 0;
      let score = 0;

      // Signal 1: source file match
      const sfMatch =
        matchesSourceFile(finding.sourceFile, ref.sourceFile) ||
        matchesSourceFile(finding.workspacePath, ref.sourceFile);
      if (sfMatch) {
        signals++;
        score += 1;
      }

      // Signal 2: category match
      if (matchesCategory(finding.category, ref.expectedCategories)) {
        signals++;
        score += 1;
      }

      // Signal 3: keyword match (at least 2 keywords must appear)
      const kwMatches = countKeywordMatches(finding, ref.keywords);
      if (kwMatches >= 2) {
        signals++;
        score += Math.min(kwMatches / ref.keywords.length, 1); // normalize
      }

      // Need at least 2 of 3 signals
      if (signals >= 2) {
        candidates.push({ refId: ref.id, findingIdx: fi, score });
      }
    }
  }

  // Greedy assignment: best score first, each ref matched at most once
  candidates.sort((a, b) => b.score - a.score);

  const matchedRefIds = new Set<string>();
  const matchedFindingIdxs = new Set<number>();

  for (const candidate of candidates) {
    if (matchedRefIds.has(candidate.refId) || matchedFindingIdxs.has(candidate.findingIdx)) {
      continue;
    }
    matchedRefIds.add(candidate.refId);
    matchedFindingIdxs.add(candidate.findingIdx);
  }

  const matchedFindings = Array.from(matchedRefIds);
  const missedFindings = REFERENCE_FINDINGS.filter((r) => !matchedRefIds.has(r.id)).map(
    (r) => r.id,
  );
  const falsePositives = findings.length - matchedFindingIdxs.size;

  // Per-category coverage
  const categoryCoverage = (cat: FlawCategory): number => {
    const refs = REFERENCE_FINDINGS.filter((r) => r.category === cat);
    if (refs.length === 0) return 1;
    const matched = refs.filter((r) => matchedRefIds.has(r.id)).length;
    return matched / refs.length;
  };

  return {
    blockingCoverage: categoryCoverage('blocking'),
    listenerLeakCoverage: categoryCoverage('listener-leak'),
    slowCodePathCoverage: categoryCoverage('slow-code-path'),
    closureLeakCoverage: categoryCoverage('closure-leak'),
    excessiveInstantiationCoverage: categoryCoverage('excessive-instantiation'),
    overallCoverage:
      REFERENCE_FINDINGS.length > 0 ? matchedRefIds.size / REFERENCE_FINDINGS.length : 0,
    matchedFindings,
    missedFindings,
    falsePositives,
  };
}

/**
 * LangSmith evaluator function.
 *
 * Receives the run output and example data, returns scores.
 */
export async function findingCoverage({
  outputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<Record<string, number>> {
  const findings = (outputs?.findings ?? []) as Finding[];
  const result = computeCoverage(findings);

  return {
    coverage_overall: result.overallCoverage,
    coverage_blocking: result.blockingCoverage,
    coverage_listener_leak: result.listenerLeakCoverage,
    coverage_slow_code_path: result.slowCodePathCoverage,
    coverage_closure_leak: result.closureLeakCoverage,
    coverage_excessive_instantiation: result.excessiveInstantiationCoverage,
    false_positive_count: result.falsePositives,
  };
}
