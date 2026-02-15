/**
 * Finding Quality evaluator (LLM-as-judge).
 *
 * An LLM rates each agent finding on a 1–5 scale across four dimensions:
 * accuracy, specificity, actionability, and explanation quality.
 */

import { readFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import { initModel } from '../../../packages/cli/src/models/init.js';
import type { Finding } from '../../../packages/cli/src/types.js';

import { REFERENCE_FINDINGS, type ReferenceFinding } from '../reference-findings.js';
import { computeCoverage } from './finding-coverage.js';

// ── Judge prompt ─────────────────────────────────────────────

const JUDGE_PROMPT = `You are an expert code reviewer evaluating the quality of a performance analysis finding.

You will receive:
1. The agent's finding (title, description, category, sourceFile, suggestedFix)
2. The actual source code of the file referenced
3. A reference description of the known performance issue (ground truth)

Rate the finding on EACH of these dimensions from 1 to 5:

- **accuracy** (1-5): Does the finding correctly identify the real performance issue described in the reference? 5 = perfectly identifies the issue, 1 = completely wrong.
- **specificity** (1-5): Does it name the exact file, function, and line number? 5 = exact file + function + line, 1 = vague or missing.
- **actionability** (1-5): Is the suggestedFix concrete and implementable? 5 = drop-in code fix, 1 = generic advice like "optimize this".
- **explanation** (1-5): Does the description clearly explain the root cause and impact? 5 = clear root cause + impact analysis, 1 = superficial.

Respond with ONLY a JSON object like:
{"accuracy": 4, "specificity": 5, "actionability": 3, "explanation": 4}

Do not include any other text.`;

// ── Helper: find matched reference findings ──────────────────

function getMatchedPairs(findings: Finding[]): Array<{ finding: Finding; ref: ReferenceFinding }> {
  const coverage = computeCoverage(findings);
  const pairs: Array<{ finding: Finding; ref: ReferenceFinding }> = [];

  // Rebuild the matching to get the actual pairs
  // (computeCoverage only returns IDs, we need the pairing)
  const matchedRefIds = new Set(coverage.matchedFindings);

  for (const ref of REFERENCE_FINDINGS) {
    if (!matchedRefIds.has(ref.id)) continue;

    // Find the best matching finding for this ref
    let bestFinding: Finding | null = null;
    let bestScore = 0;

    for (const finding of findings) {
      let score = 0;
      const sfNorm = (finding.sourceFile ?? finding.workspacePath ?? '').toLowerCase();
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
      pairs.push({ finding: bestFinding, ref });
    }
  }

  return pairs;
}

// ── Helper: read source file ─────────────────────────────────

function readSourceFile(ref: ReferenceFinding, projectRoot: string): string {
  const filePath = join(resolve(projectRoot), ref.sourceFile);
  if (existsSync(filePath)) {
    return readFileSync(filePath, 'utf-8');
  }
  return '(source file not found)';
}

// ── Main evaluator ───────────────────────────────────────────

/**
 * LangSmith evaluator function.
 *
 * Uses an LLM to judge the quality of each matched finding.
 */
export async function findingQuality({
  inputs,
  outputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<Record<string, number>> {
  const findings = (outputs?.findings ?? []) as Finding[];
  const projectRoot = (inputs?.projectRoot ?? './example') as string;
  const pairs = getMatchedPairs(findings);

  if (pairs.length === 0) {
    return {
      quality_accuracy: 0,
      quality_specificity: 0,
      quality_actionability: 0,
      quality_explanation: 0,
      quality_overall: 0,
    };
  }

  const model = initModel();
  const scores = { accuracy: 0, specificity: 0, actionability: 0, explanation: 0 };
  let evaluated = 0;

  for (const { finding, ref } of pairs) {
    const sourceCode = readSourceFile(ref, projectRoot);

    const userMessage = `## Agent Finding
Title: ${finding.title}
Category: ${finding.category}
Severity: ${finding.severity}
Source File: ${finding.sourceFile ?? '(not specified)'}
Line Number: ${finding.lineNumber ?? '(not specified)'}

Description:
${finding.description}

Suggested Fix:
${finding.suggestedFix}

## Source Code (${ref.sourceFile})
\`\`\`
${sourceCode.slice(0, 3000)}
\`\`\`

## Reference (Ground Truth)
Function: ${ref.functionName}
Issue: ${ref.description}`;

    try {
      const response = await model.invoke([
        { role: 'system', content: JUDGE_PROMPT },
        { role: 'user', content: userMessage },
      ]);

      const text =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      // Extract JSON from the response
      const jsonMatch = text.match(/\{[^}]+\}/);
      if (jsonMatch) {
        const parsed = JSON.parse(jsonMatch[0]) as Record<string, number>;
        scores.accuracy += parsed.accuracy ?? 0;
        scores.specificity += parsed.specificity ?? 0;
        scores.actionability += parsed.actionability ?? 0;
        scores.explanation += parsed.explanation ?? 0;
        evaluated++;
      }
    } catch (err) {
      console.warn(
        `[evals] Failed to judge finding "${finding.title}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  if (evaluated === 0) {
    return {
      quality_accuracy: 0,
      quality_specificity: 0,
      quality_actionability: 0,
      quality_explanation: 0,
      quality_overall: 0,
    };
  }

  const avgAccuracy = scores.accuracy / evaluated;
  const avgSpecificity = scores.specificity / evaluated;
  const avgActionability = scores.actionability / evaluated;
  const avgExplanation = scores.explanation / evaluated;

  return {
    quality_accuracy: avgAccuracy,
    quality_specificity: avgSpecificity,
    quality_actionability: avgActionability,
    quality_explanation: avgExplanation,
    quality_overall: (avgAccuracy + avgSpecificity + avgActionability + avgExplanation) / 4,
  };
}
