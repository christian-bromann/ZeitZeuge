/**
 * Shared prompt sections used by all four specialized subagent prompts.
 *
 * Domain-agnostic fragments are imported from @zeitzeuge/utils.
 * This file defines only the Vitest-specific sections (workspace structure,
 * severity rules) and re-exports everything for subagent prompts to import.
 */
export const WORKSPACE_STRUCTURE = `## Data file descriptions

- hot-functions/application.json — Hot functions from application code.
  Each entry has: functionName, selfTime, selfPercent, sourceSnippet, workspacePath.
  Use the workspacePath field to read source files (e.g. src/services/foo.ts).
- scripts/application.json — Per-script time breakdown for application code
- profiles/index.json — Manifest mapping test files to their CPU profiles
- profiles/<file>.json — CPU profile: hot functions, call trees, script breakdown
- listener-tracking.json — (if present) Event listener add/remove counts and
  exceedances where listener counts exceeded maxListeners threshold
- summary.json — Overall test run: total tests, duration, pass/fail, GC stats
- metrics/current.json — Pre-computed aggregate metrics

Application source files and test files are listed in the "Files in this
workspace" section of this prompt. Read them DIRECTLY — do NOT use ls or glob.`;

export const SEVERITY_RULES = `## Severity classification

Assign severity based on the nature and measured impact of the issue:

- **critical** — Any of:
  - Synchronous blocking of the event loop (CPU-bound loops, sync crypto, sync I/O)
  - Functions that CALL blocking functions (compound blockers)
  - Listener exceedances (count exceeding maxListeners threshold)
  - GC overhead >10% of total profile duration
  - A single function consuming >15% of APPLICATION code self-time
- **warning** — Any of:
  - Listener add/remove imbalance (addCount > 2× removeCount) without exceedance
  - O(n²) or worse algorithms on collections
  - Unnecessary serialization (JSON.parse/JSON.stringify) on hot paths
  - Closure-based memory leaks or unbounded data structures
  - A function consuming 5–15% of application self-time
- **info** — Minor inefficiencies, small optimisation opportunities, per-call
  object allocation (TextEncoder, RegExp, DateTimeFormat), or patterns that only
  matter at scale

IMPORTANT: Blocking/event-loop-blocking operations are ALWAYS critical, regardless
of measured self-time percentage. Even a short blocking call prevents the event loop
from processing other work and is a correctness issue, not just a performance issue.`;
