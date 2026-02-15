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

1. **ALWAYS read the source file** before reporting a finding. You MUST have
   read the actual code. Never report based on function names or profiling data alone.
2. **Copy code verbatim** — beforeCode must be copied exactly from the file you
   read, not paraphrased. Line numbers must match what you observed.
3. **Provide a working fix** — afterCode must be a complete drop-in replacement
   that compiles, preserves the function signature, and only fixes the perf issue.
4. **Never omit beforeCode/afterCode** — every finding MUST have both fields set.`;

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

export const STRUCTURED_OUTPUT_FIELDS = `## Structured output fields — REQUIRED for every finding

Every finding MUST include ALL of these fields:

- \`sourceFile\` — (REQUIRED) the workspace path (e.g. /src/utils/parser.ts)
- \`lineNumber\` — (REQUIRED) the 1-based line number, verified by reading the file
- \`confidence\` — \`high\` if you read the source, \`medium\` if strongly suggested,
  \`low\` if inferred
- \`beforeCode\` — (REQUIRED) the CURRENT problematic code, COPIED VERBATIM from the
  source file you read. Include the full function or the relevant 5–20 lines.
  This MUST be actual code from the file, not a paraphrase or summary.
- \`afterCode\` — (REQUIRED) the IMPROVED code showing the fix. This MUST be a
  complete, working drop-in replacement for \`beforeCode\`:
  - Same function signature and exports
  - Same return type and API contract
  - Only changes the performance issue — preserves all other behavior
  - Include ALL the code from beforeCode with just the fix applied
- \`estimatedSavingsMs\` — your estimate of time saved if the fix is applied
- \`impactMs\` — the current measured cost (e.g. selfTime of the hot function)
- \`affectedTests\` — list of test names that exercise this code path

### beforeCode / afterCode rules

- NEVER leave beforeCode or afterCode empty. Every finding must have both.
- beforeCode must be VERBATIM from the source file — do not abbreviate or paraphrase
- afterCode must be a complete replacement — not a diff, not pseudocode
- afterCode must compile and work as a drop-in replacement
- If you cannot provide a concrete fix, still include beforeCode and describe
  the fix approach in afterCode as a code comment within the actual code`;
