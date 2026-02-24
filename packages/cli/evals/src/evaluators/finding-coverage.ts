/**
 * Finding Coverage evaluator for CLI evals (deterministic).
 *
 * Measures what fraction of known performance flaws the CLI agent detected.
 * Uses the same 2-of-3 matching algorithm as the vitest evaluator but
 * with CLI-specific reference findings and categories.
 */

import type { Finding } from '@zeitzeuge/utils';
import {
  REFERENCE_FINDINGS,
  type ReferenceFinding,
  type FlawCategory,
} from '../reference-findings.js';

export interface CoverageResult {
  renderBlockingCoverage: number;
  codePatternCoverage: number;
  runtimeBlockingCoverage: number;
  memoryIssueCoverage: number;
  listenerLeakCoverage: number;
  renderingFcpCoverage: number;
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

function matchesSourceFile(agentSourceFile: string | undefined, refSourceFile: string): boolean {
  if (!agentSourceFile) return false;
  const normalized = agentSourceFile.toLowerCase();
  const refNorm = refSourceFile.toLowerCase();

  if (normalized.endsWith(refNorm)) return true;

  const agentBasename = normalized.split('/').pop() ?? '';
  const refBasename = refNorm.split('/').pop() ?? '';
  if (agentBasename && agentBasename === refBasename) return true;

  if (normalized.includes(refNorm)) return true;

  return false;
}

function matchesCategory(agentCategory: string | undefined, expectedCategories: string[]): boolean {
  if (!agentCategory) return false;
  return expectedCategories.some(
    (expected) => agentCategory.toLowerCase() === expected.toLowerCase(),
  );
}

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

export function computeCoverage(
  findings: Finding[],
  referenceFindings: ReferenceFinding[] = REFERENCE_FINDINGS,
): CoverageResult {
  const candidates: MatchCandidate[] = [];

  for (let fi = 0; fi < findings.length; fi++) {
    const finding = findings[fi]!;

    for (const ref of referenceFindings) {
      let signals = 0;
      let score = 0;

      const sfMatch =
        matchesSourceFile(finding.sourceFile, ref.sourceFile) ||
        matchesSourceFile(finding.workspacePath, ref.sourceFile) ||
        matchesSourceFile(finding.resourceUrl, ref.sourceFile);
      if (sfMatch) {
        signals++;
        score += 1;
      }

      if (matchesCategory(finding.category, ref.expectedCategories)) {
        signals++;
        score += 1;
      }

      const kwMatches = countKeywordMatches(finding, ref.keywords);
      if (kwMatches >= 2) {
        signals++;
        score += Math.min(kwMatches / ref.keywords.length, 1);
      }

      if (signals >= 2) {
        candidates.push({ refId: ref.id, findingIdx: fi, score });
      }
    }
  }

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
  const missedFindings = referenceFindings.filter((r) => !matchedRefIds.has(r.id)).map((r) => r.id);
  const falsePositives = findings.length - matchedFindingIdxs.size;

  const categoryCoverage = (cat: FlawCategory): number => {
    const refs = referenceFindings.filter((r) => r.category === cat);
    if (refs.length === 0) return 1;
    const matched = refs.filter((r) => matchedRefIds.has(r.id)).length;
    return matched / refs.length;
  };

  return {
    renderBlockingCoverage: categoryCoverage('render-blocking'),
    codePatternCoverage: categoryCoverage('code-pattern'),
    runtimeBlockingCoverage: categoryCoverage('runtime-blocking'),
    memoryIssueCoverage: categoryCoverage('memory-issue'),
    listenerLeakCoverage: categoryCoverage('listener-leak'),
    renderingFcpCoverage: categoryCoverage('rendering-fcp'),
    overallCoverage:
      referenceFindings.length > 0 ? matchedRefIds.size / referenceFindings.length : 0,
    matchedFindings,
    missedFindings,
    falsePositives,
  };
}
