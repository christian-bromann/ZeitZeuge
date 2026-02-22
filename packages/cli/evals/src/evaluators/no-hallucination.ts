/**
 * No Hallucination evaluator for CLI evals (deterministic).
 *
 * For CLI findings, we check that referenced workspace paths,
 * resource URLs, or source files correspond to real resources
 * in the fixture site.
 */

import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { Finding } from '@zeitzeuge/utils';

const FIXTURE_SITE_DIR = resolve(import.meta.dirname, '..', 'fixture-site');

function resolveToFixtureSite(path: string): boolean {
  let normalized = path;

  if (
    normalized.startsWith('/scripts/') ||
    normalized.startsWith('/styles/') ||
    normalized.startsWith('/html/')
  ) {
    return true;
  }

  if (normalized.startsWith('http://') || normalized.startsWith('https://')) {
    try {
      const url = new URL(normalized);
      normalized = url.pathname;
    } catch {
      return false;
    }
  }

  if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  const candidates = [
    join(FIXTURE_SITE_DIR, normalized),
    join(FIXTURE_SITE_DIR, 'src', normalized),
  ];

  return candidates.some((c) => existsSync(resolve(c)));
}

export function computeHallucinationRate(findings: Finding[]): Record<string, number> {
  if (findings.length === 0) {
    return {
      hallucination_rate: 0,
      source_reference_accuracy: 1,
    };
  }

  let validReferences = 0;
  let hallucinatedFindings = 0;

  for (const finding of findings) {
    const ref = finding.sourceFile ?? finding.workspacePath ?? finding.resourceUrl;

    if (ref) {
      if (resolveToFixtureSite(ref)) {
        validReferences++;
      } else {
        hallucinatedFindings++;
      }
    }
  }

  const totalWithRef = validReferences + hallucinatedFindings;

  return {
    hallucination_rate: findings.length > 0 ? hallucinatedFindings / findings.length : 0,
    source_reference_accuracy: totalWithRef > 0 ? validReferences / totalWithRef : 1,
  };
}
