/**
 * Code Fix Quality evaluator (LLM-as-judge).
 *
 * For findings that include beforeCode and afterCode, an LLM evaluates
 * whether the fix is correct, is a drop-in replacement, and doesn't
 * introduce regressions.
 */

import { initModel, type Finding } from '@zeitzeuge/utils';

const CODE_FIX_JUDGE_PROMPT = `You are an expert code reviewer evaluating a proposed performance fix.

You will receive:
1. The finding description (what performance issue was identified)
2. The BEFORE code (current problematic code)
3. The AFTER code (proposed fix)

Evaluate the fix on these criteria:

- **correctness**: Would the afterCode actually fix the described performance issue? (yes/no)
- **drop_in**: Is afterCode a valid drop-in replacement for beforeCode? Same function signature, same exports, compatible API? (yes/no)
- **no_regressions**: Does the fix preserve existing functionality without introducing bugs? (yes/no)

Respond with ONLY a JSON object like:
{"correctness": true, "drop_in": true, "no_regressions": true}

Do not include any other text.`;

export async function codeFixes({
  outputs,
}: {
  inputs: Record<string, unknown>;
  outputs: Record<string, unknown>;
  referenceOutputs?: Record<string, unknown>;
}): Promise<Record<string, number>> {
  const findings = (outputs?.findings ?? []) as Finding[];

  const withFixes = findings.filter((f) => f.beforeCode && f.afterCode);
  const hasBeforeAfterRatio = findings.length > 0 ? withFixes.length / findings.length : 0;

  if (withFixes.length === 0) {
    return {
      code_fix_correctness: 0,
      code_fix_has_before_after: hasBeforeAfterRatio,
    };
  }

  const model = await initModel();
  let correctCount = 0;
  let evaluated = 0;

  for (const finding of withFixes) {
    const userMessage = `## Finding
Title: ${finding.title}
Description: ${finding.description}
Category: ${finding.category}

## Before Code
\`\`\`
${finding.beforeCode}
\`\`\`

## After Code (Proposed Fix)
\`\`\`
${finding.afterCode}
\`\`\``;

    try {
      const response = await model.invoke([
        { role: 'system', content: CODE_FIX_JUDGE_PROMPT },
        { role: 'user', content: userMessage },
      ]);

      const text =
        typeof response.content === 'string' ? response.content : JSON.stringify(response.content);

      let parsed: Record<string, boolean> | null = null;
      for (const m of text.matchAll(/\{[^{}]+\}/g)) {
        try {
          const candidate = JSON.parse(m[0]) as Record<string, boolean>;
          if (typeof candidate.correctness === 'boolean') {
            parsed = candidate;
            break;
          }
        } catch {
          // not the right JSON fragment
        }
      }

      if (parsed) {
        evaluated++;
        if (parsed.correctness && parsed.drop_in && parsed.no_regressions) {
          correctCount++;
        }
      }
    } catch (err) {
      console.warn(
        `[evals] Failed to judge code fix for "${finding.title}": ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  return {
    code_fix_correctness: evaluated > 0 ? correctCount / evaluated : 0,
    code_fix_has_before_after: hasBeforeAfterRatio,
  };
}
