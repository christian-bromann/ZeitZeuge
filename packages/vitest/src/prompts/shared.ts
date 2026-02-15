/**
 * Shared prompt sections used by all four specialized subagent prompts.
 *
 * Extracted from the monolithic VITEST_SYSTEM_PROMPT to avoid duplication
 * and ensure consistency across subagents.
 */

export const WORKSPACE_STRUCTURE = `## Data file descriptions

- /hot-functions/application.json — Hot functions from application code.
  Each entry has: functionName, selfTime, selfPercent, sourceSnippet, workspacePath
- /scripts/application.json — Per-script time breakdown for application code
- /profiles/index.json — Manifest mapping test files to their CPU profiles
- /profiles/<file>.json — CPU profile: hot functions, call trees, script breakdown
- /listener-tracking.json — (if present) Event listener add/remove counts and
  exceedances where listener counts exceeded maxListeners threshold
- /summary.json — Overall test run: total tests, duration, pass/fail, GC stats
- /metrics/current.json — Pre-computed aggregate metrics

Application source files and test files are listed in the "Files in this
workspace" section of this prompt. Read them DIRECTLY — do NOT use ls or glob.`;

export const VERIFICATION_RULES = `## Verification rules (mandatory for every finding)

1. **ALWAYS read the source file** in /src/ or /tests/ and verify the code
   BEFORE suggesting a fix. Never suggest a fix for code you have not read.
2. **Never guess at line numbers** — confirm by reading the file. If the profile
   reports a line number but the source at that line doesn't match, say so.
3. Each \`suggestedFix\` MUST reference the actual current code and describe
   what to change. Include a before/after snippet from the real source.
4. Never report a finding based solely on a function name — always read the
   implementation to confirm the issue exists.`;

export const SEVERITY_RULES = `## Severity classification

Assign severity based on measured impact — do NOT guess:

- **critical** — A single function consuming >15% self-time, listener exceedances
  (count exceeding maxListeners), or GC overhead >10% of total profile duration
- **warning** — A function consuming 5–15% self-time, listener add/remove imbalance
  where addCount > 2× removeCount, or GC overhead between 5–10%
- **info** — A function consuming <5% self-time, minor inefficiencies,
  dependency observations, or small optimisation opportunities

Always base severity on the actual numbers from the profiling data — never inflate.`;

export const OUTPUT_FORMAT = `## Output requirements

- Report ALL findings you discover — typically 3–8 per subagent. Do NOT
  stop at 2-3 findings. Exhaustively analyze every function in every file.
- Each finding MUST have sourceFile, beforeCode, and afterCode
- Be specific — name exact files, functions, and line numbers
- Provide concrete code-level fixes, not generic advice

### CRITICAL: Multiple findings per function and per file

- A single function CAN have multiple distinct issues — report each as a
  SEPARATE finding. For example, hashPassword() might both block the event
  loop AND allocate a TextEncoder on every call — these are TWO findings
  with different categories.
- A single file often has MANY issues across different functions. Read the
  ENTIRE file top-to-bottom and report EVERY issue you find, not just the
  first one.
- If function A calls function B and both have issues, report findings for
  BOTH functions separately.
- Do NOT skip issues you consider "minor" — report them with severity: info.`;

export const FINDING_CATEGORIES = `## Finding categories

Each finding MUST use one of these exact category values:

- **algorithm** — Inefficient algorithm: O(n²) loops, brute-force search, repeated work
- **serialization** — Excessive JSON.stringify/parse, string concatenation, encoding
- **allocation** — Excessive object/array creation causing GC pressure
- **event-handling** — Listener leaks, unbounded event handler accumulation
- **hot-function** — Generic CPU-hot function that doesn't fit a more specific category
- **gc-pressure** — High garbage collection overhead
- **listener-leak** — Event listeners not cleaned up properly
- **unnecessary-computation** — Redundant work that could be cached or eliminated
- **blocking-io** — Synchronous I/O or blocking operations in hot paths
- **other** — Doesn't fit any of the above

Prefer more specific categories (algorithm, serialization, allocation, event-handling,
blocking-io, listener-leak) over generic ones (hot-function, other).`;

export const PARALLEL_TOOL_CALLS = `## CRITICAL: Tool call strategy — parallel reads

You MUST call read_file for ALL files in a SINGLE response. Batch every
read into ONE turn — do NOT read files one-at-a-time across multiple turns.

Your FIRST turn MUST contain read_file calls for:
1. The data JSON files listed in "FILES IN THIS WORKSPACE" above
2. ALL application source files (the /src/ paths) listed above
That's typically 10-15 read_file calls in your FIRST response.

FORBIDDEN actions:
- ls — NEVER call ls. File paths are already listed above.
- glob — NEVER call glob. File paths are already listed above.
- Reading files one at a time across multiple turns

The file list in "FILES IN THIS WORKSPACE" above is COMPLETE and EXACT.`;

export const STRUCTURED_OUTPUT_FIELDS = `## Structured output fields

For each finding, fill in as many fields as applicable:

- \`sourceFile\` — the workspace path (e.g. /src/utils/parser.ts) where the issue
  occurs. Always set this when you can identify the file.
- \`lineNumber\` — the 1-based line number in the source file. Only set after
  verifying by reading the file.
- \`confidence\` — \`high\` if you read the source and confirmed the issue,
  \`medium\` if the profiling data strongly suggests it but you couldn't fully
  verify, \`low\` if inferred from patterns.
- \`estimatedSavingsMs\` — your estimate of time saved if the fix is applied.
- \`beforeCode\` — a snippet of the CURRENT problematic code, copied from the
  source file you read. Keep it focused (5–15 lines).
- \`afterCode\` — the IMPROVED code snippet showing the fix. Must be a drop-in
  replacement for \`beforeCode\`.
- \`impactMs\` — the current measured cost (e.g. selfTime of the hot function).
- \`affectedTests\` — list of test names that exercise this code path.`;
