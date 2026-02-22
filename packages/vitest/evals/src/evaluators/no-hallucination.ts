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

function resolveSourceFile(sourceFile: string, projectRoot: string): string | null {
  let normalized = sourceFile;
  if (normalized.startsWith('/src/')) {
    normalized = normalized.slice(5);
  } else if (normalized.startsWith('/tests/')) {
    normalized = normalized.slice(7);
  } else if (normalized.startsWith('/')) {
    normalized = normalized.slice(1);
  }

  const candidates = [
    join(projectRoot, normalized),
    join(projectRoot, 'src', normalized),
    join(projectRoot, 'tests', normalized),
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

function beforeCodeAppearsInSource(beforeCode: string, sourceContent: string): boolean {
  const beforeLines = beforeCode
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l.length > 3);

  if (beforeLines.length === 0) return true;

  const sourceNormalized = sourceContent.split('\n').map((l) => l.trim());

  let matchedLines = 0;
  for (const beforeLine of beforeLines) {
    if (sourceNormalized.some((sl) => sl.includes(beforeLine) || beforeLine.includes(sl))) {
      matchedLines++;
    }
  }

  return matchedLines / beforeLines.length >= 0.5;
}

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

    if (sourceFile) {
      const resolved = resolveSourceFile(sourceFile, projectRoot);
      if (resolved) {
        validSourceFiles++;
        const sourceContent = readFileSync(resolved, 'utf-8');
        const sourceLines = sourceContent.split('\n');

        if (finding.lineNumber != null) {
          if (finding.lineNumber < 1 || finding.lineNumber > sourceLines.length) {
            isHallucinated = true;
          }
        }

        if (finding.beforeCode) {
          if (!beforeCodeAppearsInSource(finding.beforeCode, sourceContent)) {
            isHallucinated = true;
          }
        }
      } else {
        isHallucinated = true;
      }
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
