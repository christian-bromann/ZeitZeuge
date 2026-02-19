/**
 * Domain-agnostic prompt fragments shared by all analysis agents.
 *
 * These prompt sections enforce consistent quality standards across
 * both the Vitest and CLI browser analysis agents. Domain-specific
 * sections (workspace structure, severity thresholds) remain in
 * their respective packages.
 */

export const VERIFICATION_RULES = `## Verification rules (mandatory for every finding)

1. **ALWAYS read the source file** before reporting a finding. You MUST have
   read the actual code. Never report based on function names or profiling data alone.
2. **Copy code verbatim** — beforeCode must be copied exactly from the file you
   read, not paraphrased. Line numbers must match what you observed.
3. **Provide a working fix** — afterCode must be a complete drop-in replacement
   that compiles, preserves the function signature, and only fixes the perf issue.
4. **Never omit beforeCode/afterCode** — every finding MUST have both fields set.`;

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

Each finding MUST use one of these EXACT category values — do NOT invent new categories:

- **algorithm** — Inefficient algorithm: O(n²) loops, brute-force search, repeated work
- **serialization** — Excessive JSON.stringify/parse, string concatenation, encoding
- **allocation** — Excessive object/array creation, per-call instantiation causing GC pressure
- **event-handling** — Listener leaks, unbounded event handler accumulation
- **hot-function** — Generic CPU-hot function that doesn't fit a more specific category
- **gc-pressure** — Memory leaks, closure-captured references, unbounded data structures
  that grow without eviction, or high garbage collection overhead. Use this for ANY
  finding about memory growth, retained references, or missing cleanup/eviction.
- **listener-leak** — Event listeners not cleaned up properly
- **unnecessary-computation** — Redundant work that could be cached or eliminated,
  including regex recompilation with constant patterns
- **blocking-io** — Synchronous I/O or blocking operations in hot paths
- **memory-leak** — Memory leaks from unbounded arrays, maps, caches
- **large-retained-object** — Single objects retaining disproportionate memory
- **detached-dom** — Detached DOM nodes still referenced in memory
- **render-blocking** — Render-blocking scripts or stylesheets
- **long-task** — Long tasks blocking the main thread
- **waterfall-bottleneck** — Sequential resource chains that could load in parallel
- **large-asset** — Oversized bundles or assets
- **frame-blocking-function** — Functions blocking the main thread > 50ms
- **other** — Doesn't fit any of the above

Prefer more specific categories (algorithm, serialization, allocation, event-handling,
blocking-io, listener-leak, gc-pressure) over generic ones (hot-function, other).`;

export const PARALLEL_TOOL_CALLS = `## CRITICAL: Tool call strategy — scripts for data, read_file for source

Your FIRST turn MUST:
1. Run analysis scripts (execute_command) to query the JSON data files.
   Use pre-built helper scripts in skills/ or write your own using the
   data-scripting skill.
2. Call read_file for ALL application source files listed above.

Batch everything into ONE turn. Do NOT read data files one-at-a-time.

For data files: run a helper script or write a custom one. This is faster
and uses fewer tokens than reading raw JSON.

For source files: use read_file since you need to see the exact code for
beforeCode/afterCode suggestions.

FORBIDDEN actions:
- ls — NEVER call ls. File paths are already listed above.
- glob — NEVER call glob. File paths are already listed above.
- Reading JSON data files with read_file — use scripts instead.`;

export const FULL_RESPONSE_REQUIREMENT = `## CRITICAL — Your response MUST contain ALL findings in full

Your final response is the ONLY thing the orchestrator sees. If you write a short summary
like "All N findings have been reported", the orchestrator CANNOT see your findings and
they will be LOST.

You MUST include the COMPLETE analysis in your response text. For EVERY finding, write out:
- Title, category, severity, sourceFile, lineNumber
- Full description of the issue
- Complete beforeCode (verbatim from the source file)
- Complete afterCode (working drop-in replacement)

Do NOT abbreviate. Do NOT say "findings have been reported" without listing them.
The orchestrator will extract findings from your response text — if a finding is not
in your text, it does not exist.`;

export const STRUCTURED_OUTPUT_FIELDS = `## Structured output fields — REQUIRED for every finding

Every finding MUST include ALL of these fields:

- \`sourceFile\` — (REQUIRED) the workspace path (e.g. src/utils/parser.ts or scripts/app.js)
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
- \`impactMs\` — the current measured cost (e.g. selfTime of the hot function,
  blocking function duration, resource load time)

### beforeCode / afterCode rules

- NEVER leave beforeCode or afterCode empty. Every finding must have both.
- beforeCode must be VERBATIM from the source file — do not abbreviate or paraphrase.
  Copy the COMPLETE function (or the complete relevant section of 5-30 lines).
  Do NOT use "..." or "// ..." to skip lines. Include the full code block.
- afterCode must be a COMPLETE, WORKING replacement for the beforeCode block:
  - Same function signature, same exports, same return type
  - Must compile and produce identical behavior except for the performance fix
  - Include ALL the code from beforeCode, not just the changed lines
  - If the fix requires adding a module-level constant (e.g., hoisting a RegExp or
    TextEncoder), include that declaration in afterCode
  - For blocking operations: the fix should actually make the operation non-blocking
    (e.g., use async APIs, yield to the event loop, or use workers)
  - For excessive instantiation: hoist the construction to module level and reuse it
- afterCode must NOT be a diff, pseudocode, or description of changes
- If you cannot provide a concrete fix, still include beforeCode and describe
  the fix approach in afterCode as a code comment within the actual code`;
