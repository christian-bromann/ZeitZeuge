/**
 * Shared prompt sections for the CLI browser analysis subagents.
 *
 * Domain-agnostic fragments are imported from @zeitzeuge/utils.
 * This file defines browser-specific sections (workspace structure,
 * severity rules) and re-exports everything for subagent prompts.
 */

// Re-export domain-agnostic fragments from shared utils
export {
  VERIFICATION_RULES,
  OUTPUT_FORMAT,
  FINDING_CATEGORIES,
  PARALLEL_TOOL_CALLS,
  FULL_RESPONSE_REQUIREMENT,
  STRUCTURED_OUTPUT_FIELDS,
} from '@zeitzeuge/utils';

// ── Browser-specific prompt sections ──

export const WORKSPACE_STRUCTURE = `## Workspace structure

- /heap/summary.json — Parsed V8 heap snapshot: largest objects, type stats,
  constructor stats, detached DOM nodes, closure stats
- /trace/summary.json — Page load metrics: timing, long tasks, render-blocking
  resources, resource breakdown
- /trace/network-waterfall.json — Every network request with timing, size,
  priority, render-blocking status
- /trace/asset-manifest.json — Index of all assets with paths to stored files
- /trace/runtime/summary.json — Runtime trace overview: frame breakdown
  (scripting/layout/paint/GC), blocking function count, listener imbalances,
  GC stats
- /trace/runtime/blocking-functions.json — Functions that blocked the main
  thread > 50ms, with script URL, line number, call stack, and duration
- /trace/runtime/event-listeners.json — Event listener add/remove counts per
  event type, with source locations
- /trace/runtime/frame-breakdown.json — Time spent in scripting vs layout vs
  paint vs GC
- /trace/runtime/raw-events.json — Full Chrome trace events (large file — read
  to investigate specific function calls, layouts, GC, and event dispatches)
- /scripts/*.js — Actual JavaScript source files captured during page load
- /styles/*.css — Actual CSS source files
- /html/document.html — The HTML document

All files are listed in the "FILES IN THIS WORKSPACE" section of this prompt.
Read them DIRECTLY — do NOT use ls or glob.`;

export const SEVERITY_RULES = `## Severity classification

Assign severity based on measured impact — do NOT guess:

- **critical** — Any of:
  - A blocking function >500ms on the main thread
  - A retained heap object >5MB
  - A render-blocking resource >200KB
  - Listener addCount > 10× removeCount
  - GC pauses totalling >500ms
  - Layout thrashing with >5 forced reflows
- **warning** — Any of:
  - A blocking function 100–500ms
  - A retained heap object 1–5MB
  - A render-blocking resource 50–200KB
  - Listener addCount > 2× removeCount
  - GC pauses totalling 100–500ms
  - Sequential waterfall adding >200ms to load time
- **info** — Any of:
  - Blocking function 50–100ms
  - Retained object <1MB
  - Minor optimisation opportunities
  - Observations about dependency usage or uncompressed assets

Always base severity on the actual numbers from the captured data — never inflate.

IMPORTANT: Blocking/event-loop-blocking operations that exceed 500ms are ALWAYS
critical. Even shorter blocking calls prevent the main thread from processing
user interactions and paint updates.`;

export const CROSS_REFERENCING = `## Cross-referencing data

- When a script appears in BOTH /trace/runtime/blocking-functions.json (CPU)
  AND /heap/summary.json (memory), mention both dimensions in the finding.
- Check /trace/runtime/event-listeners.json for listener imbalances and
  cross-reference with the actual addEventListener calls in /scripts/.
- Use /trace/network-waterfall.json to identify sequential chains, then read
  the initiating script to confirm the dependency.
- When GC pauses are significant, cross-reference with heap data to identify
  which constructors or allocation patterns are responsible.`;

export const IMPACT_ESTIMATION = `## Estimating impactMs

Every finding should include an \`impactMs\` estimate when possible:

- For render-blocking resources: impactMs ≈ the resource's load duration
  (from the network waterfall) that could be deferred.
- For blocking functions: impactMs ≈ the function's duration minus 50ms
  (the long-task threshold).
- For memory issues: impactMs may not apply — use \`retainedSize\` instead.
- For sequential waterfalls: impactMs ≈ total chain duration minus the
  longest single resource (the savings from parallelising).
- If you cannot reasonably estimate the savings, omit impactMs rather than
  guessing.`;
