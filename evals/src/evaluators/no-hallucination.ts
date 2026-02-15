/**
 * No Hallucination evaluator (deterministic).
 *
 * Verifies that every finding references real code:
 * 1. sourceFile must correspond to an actual file
 * 2. lineNumber (if provided) must exist in the file
 * 3. beforeCode (if provided) must approximately appear in the source
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { Finding } from '@zeitzeuge/utils';

// ── Helpers ──────────────────────────────────────────────────

/**
 * Try to resolve a finding's sourceFile to an actual file on disk.
 * The agent may use workspace paths like /src/utils/crypto.ts or
 * relative paths like src/utils/crypto.ts.
 */
function resolveSourceFile(sourceFile: string, projectRoot: string): string | null {
  // Strip leading /src/ or /tests/ workspace prefix
  let normalized = sourceFile;
  if (normalized.startsWith('/src/')) {
    normalized = normalized.slice(5); // remove "/src/"
  } else if (normalized.startsWith('/tests/')) {
    normalized = normalized.slice(7); // remove "/tests/"
  } else if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  // Try direct resolution from project root
  const candidates = [
    join(projectRoot, normalized),
    join(projectRoot, 'src', normalized),
    join(projectRoot, 'tests', normalized),
    // Try original path as-is (might be absolute)
    sourceFile,
  ];

  for (const candidate of candidates) {
    const absPath = resolve(candidate);
    if (existsSync(absPath)) {
      return absPath;
    }
  }

  return null;
}

/**
 * Check if beforeCode approximately appears in the source file.
 * Uses line-by-line fuzzy matching: strips whitespace and checks
 * if enough lines from beforeCode appear in the source.
 */
function beforeCodeAppearsInSource(beforeCode: string, sourceContent: string): boolean {
  const beforeLines = beforeCode
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3); // skip very short/empty lines

  if (beforeLines.length === 0) return true; // nothing to check

  const sourceNormalized = sourceContent.split('\n').map((l) => l.trim());

  let matchedLines = 0;
  for (const beforeLine of beforeLines) {
    if (sourceNormalized.some((sl) => sl.includes(beforeLine) || beforeLine.includes(sl))) {
      matchedLines++;
    }
  }

  // At least 50% of non-trivial beforeCode lines should appear in the source
  return matchedLines / beforeLines.length >= 0.5;
}

// ── Main evaluator ───────────────────────────────────────────

/**
 * LangSmith evaluator function for hallucination detection.
 */
export async function noHallucination({
  inputs,
  outputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<Record<string, number>> {
  const findings = (outputs?.findings ?? []) as Finding[];
  const projectRoot = resolve((inputs?.projectRoot ?? './example') as string);

  if (findings.length === 0) {
    return {
      hallucination_rate: 0,
      source_file_accuracy: 1,
    };
  }

  let validSourceFiles = 0;
  let hallucinatedFindings = 0;

  for (const finding of findings) {
    let isHallucinated = false;
    const sourceFile = finding.sourceFile ?? finding.workspacePath;

    // Check 1: sourceFile resolves to a real file
    if (sourceFile) {
      const resolved = resolveSourceFile(sourceFile, projectRoot);
      if (resolved) {
        validSourceFiles++;
        const sourceContent = readFileSync(resolved, 'utf-8');
        const sourceLines = sourceContent.split('\n');

        // Check 2: lineNumber exists in the file
        if (finding.lineNumber != null) {
          if (finding.lineNumber < 1 || finding.lineNumber > sourceLines.length) {
            isHallucinated = true;
          }
        }

        // Check 3: beforeCode approximately appears in the source
        if (finding.beforeCode) {
          if (!beforeCodeAppearsInSource(finding.beforeCode, sourceContent)) {
            isHallucinated = true;
          }
        }
      } else {
        // sourceFile doesn't resolve to a real file
        isHallucinated = true;
      }
    } else {
      // No sourceFile at all — not necessarily hallucination, but not ideal
      // Don't count as hallucination since some findings may not need a source file
    }

    if (isHallucinated) {
      hallucinatedFindings++;
    }
  }

  return {
    hallucination_rate: findings.length > 0 ? hallucinatedFindings / findings.length : 0,
    source_file_accuracy: findings.length > 0 ? validSourceFiles / findings.length : 0,
  };
}
