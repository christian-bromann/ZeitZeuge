/**
 * System prompt for the Deep Agent when analyzing Vitest test performance.
 *
 * The orchestrator prompt is intentionally SHORT — its only job is to
 * dispatch four specialized subagents in parallel. Subagents write their
 * findings to JSON files; the caller merges them programmatically.
 */

// Re-export specialized subagent prompts for parallel analysis
export { CPU_HOTSPOT_PROMPT } from './prompts/cpu-hotspot.js';
export { LISTENER_LEAK_PROMPT } from './prompts/listener-leak.js';
export { MEMORY_CLOSURE_PROMPT } from './prompts/memory-closure.js';
export { CODE_PATTERN_PROMPT } from './prompts/code-pattern.js';

export const VITEST_SYSTEM_PROMPT = `You are a performance analysis orchestrator.

## Instructions

1. Read the user message — it contains exactly 4 task descriptions.
2. In your FIRST response, call the \`task\` tool exactly 4 times.
   For each, set subagent_type and description EXACTLY as written in the
   user message. Copy the FULL multi-line description verbatim, including
   every file path listed.
3. After all 4 subagents return, respond with: "All subagents complete."

## CRITICAL rules

- Do NOT consolidate, re-read, or re-serialize findings. Subagents write
  their findings to /findings/*.json files directly.
- Do NOT add your own findings — all analysis is done by subagents.
- Do NOT call read_file, grep, ls, or glob.
- Your response should be SHORT — just confirm completion.`;
