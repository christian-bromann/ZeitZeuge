import { createDeepAgent, type BackendProtocol, type SubAgent } from 'deepagents';
import { toolStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Ora } from 'ora';

import { BROWSER_ORCHESTRATOR_PROMPT } from './prompts.js';
import { MEMORY_HEAP_PROMPT } from './prompts/memory-heap.js';
import { PAGE_LOAD_PROMPT } from './prompts/page-load.js';
import { RUNTIME_BLOCKING_PROMPT } from './prompts/runtime-blocking.js';
import { CODE_PATTERN_PROMPT } from './prompts/code-pattern.js';
import {
  FindingsSchema,
  invokeWithTodoStreaming,
  insertFileListIntoPrompt,
  buildFileListPromptSection,
  deduplicateFindings,
  rankFindings,
  formatBytes,
  type Finding,
  type HeapSummary,
  type TraceResult,
  type FileListConfig,
} from '@zeitzeuge/utils';

/** Context for building a dynamic page-load user message. */
export interface PageLoadContext {
  url: string;
  heapSummary: HeapSummary;
  traceResult: TraceResult;
  /** All workspace file paths from workspace creation. */
  workspaceFiles?: string[];
}

/**
 * Build the browser-specific file list section using the shared utility.
 *
 * Categorises workspace files into data files, scripts, styles, and HTML
 * for injection into each subagent's system prompt.
 */
function buildBrowserFileListSection(ctx: PageLoadContext): string {
  const { traceResult, workspaceFiles = [] } = ctx;
  const hasRuntime = !!traceResult.runtimeTrace;

  const dataFiles: FileListConfig['dataFiles'] = [
    { path: '/heap/summary.json', description: '(parsed heap snapshot)' },
    { path: '/trace/summary.json', description: '(page load metrics + render-blocking resources)' },
    { path: '/trace/network-waterfall.json', description: '(request timing and sizes)' },
    { path: '/trace/asset-manifest.json', description: '(index of stored assets)' },
  ];

  if (hasRuntime) {
    dataFiles.push(
      { path: '/trace/runtime/summary.json', description: '(runtime trace overview)' },
      {
        path: '/trace/runtime/blocking-functions.json',
        description: '(main thread blocking functions)',
      },
      { path: '/trace/runtime/event-listeners.json', description: '(listener add/remove counts)' },
      {
        path: '/trace/runtime/frame-breakdown.json',
        description: '(scripting vs layout vs paint vs GC)',
      },
      { path: '/trace/runtime/raw-events.json', description: '(full Chrome trace events)' },
    );
  }

  // Categorise asset files from workspace
  const scriptFiles = workspaceFiles.filter((f) => f.startsWith('/scripts/'));
  const styleFiles = workspaceFiles.filter((f) => f.startsWith('/styles/'));
  const htmlFiles = workspaceFiles.filter((f) => f.startsWith('/html/'));

  const additionalSections: FileListConfig['additionalSections'] = [];
  if (styleFiles.length > 0) {
    additionalSections.push({ title: 'CSS source files', files: styleFiles });
  }
  if (htmlFiles.length > 0) {
    additionalSections.push({ title: 'HTML files', files: htmlFiles });
  }

  return buildFileListPromptSection({
    dataFiles,
    sourceFiles: scriptFiles,
    additionalSections,
  });
}

/**
 * Build a user message for the orchestrator with 4 task descriptions.
 *
 * Includes COMPLETE task descriptions with file paths so the orchestrator
 * copies them verbatim into each subagent's task description.
 */
function buildBrowserUserMessage(ctx: PageLoadContext): string {
  const { url, heapSummary, traceResult, workspaceFiles = [] } = ctx;
  const m = traceResult.metrics;
  const reqCount = traceResult.networkRequests.length;
  const renderBlocking = traceResult.networkRequests.filter((r) => r.isRenderBlocking).length;
  const totalTransfer = traceResult.networkRequests.reduce((s, r) => s + r.encodedSize, 0);
  const hasRuntime = !!traceResult.runtimeTrace;

  // Build the file list for each subagent's task description
  const scriptFiles = workspaceFiles.filter((f) => f.startsWith('/scripts/'));
  const styleFiles = workspaceFiles.filter((f) => f.startsWith('/styles/'));
  const htmlFiles = workspaceFiles.filter((f) => f.startsWith('/html/'));
  const allSourceFiles = [...scriptFiles, ...styleFiles, ...htmlFiles]
    .map((f) => `  ${f}`)
    .join('\n');

  const dataFiles = [
    '  /heap/summary.json',
    '  /trace/summary.json',
    '  /trace/network-waterfall.json',
    '  /trace/asset-manifest.json',
    hasRuntime ? '  /trace/runtime/summary.json' : '',
    hasRuntime ? '  /trace/runtime/blocking-functions.json' : '',
    hasRuntime ? '  /trace/runtime/event-listeners.json' : '',
    hasRuntime ? '  /trace/runtime/frame-breakdown.json' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const allFiles = `${dataFiles}\n${allSourceFiles}`;

  let runtimeInfo = '';
  if (hasRuntime) {
    const rt = traceResult.runtimeTrace!;
    runtimeInfo = `\nRuntime trace: ${rt.blockingFunctions.length} blocking functions, ${rt.gcEvents.length} GC events (${Math.round(rt.gcEvents.reduce((s, e) => s + e.duration, 0))}ms total)`;
  }

  return `Dispatch all 4 subagent tasks NOW in a single response.
Use these EXACT descriptions (copy them verbatim):

TASK 1 — subagent_type: "memory-heap"
description: "Find memory issues: detached DOM nodes, large retained objects, constructor hotspots, closure leaks, and unbounded caches.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze /heap/summary.json for: detached DOM nodes, top retained objects by retainedSize, constructor types with high instance counts, closures with large retained sizes. Cross-reference with source files to verify root causes. Report each distinct issue as a separate finding with beforeCode and afterCode."

TASK 2 — subagent_type: "page-load"
description: "Find page load issues: render-blocking scripts/CSS, large bundles, sequential waterfalls, and uncompressed resources.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze /trace/summary.json and /trace/network-waterfall.json for: render-blocking resources without async/defer, scripts >100KB that could be split, sequential request chains that could load in parallel. Read each render-blocking script to judge if it must be synchronous. Report each distinct issue as a separate finding with beforeCode and afterCode."

TASK 3 — subagent_type: "runtime-blocking"
description: "Find runtime issues: main-thread blocking functions, event listener imbalances, GC pressure, layout thrashing, and unthrottled event handlers.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze /trace/runtime/blocking-functions.json for functions >50ms. For each, read the source at the reported line number. Check for compound blockers (A calls blocking B — report BOTH). Check event-listeners.json for addCount >> removeCount. Check for layout thrashing patterns. Report each distinct issue as a separate finding with beforeCode and afterCode."

TASK 4 — subagent_type: "code-pattern"
description: "Find frontend code anti-patterns: inline scripts, DOM manipulation in loops, missing event delegation, synchronous XHR, non-passive listeners, CSS issues, and missing image dimensions.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then check EVERY file top-to-bottom for: inline <script> blocks in HTML, DOM reads+writes inside loops (layout thrashing), querySelectorAll+forEach+addEventListener patterns (missing delegation), non-passive scroll/touch listeners, CSS @import statements, <img> without width/height. Report each pattern as a separate finding with beforeCode and afterCode."

URL: ${url}
Page load: ${Math.round(m.loadComplete)}ms | FCP: ${Math.round(m.firstContentfulPaint)}ms | LCP: ${Math.round(m.largestContentfulPaint)}ms | TBT: ${Math.round(m.totalBlockingTime)}ms
Heap: ${formatBytes(heapSummary.metadata.totalSize)} total, ${heapSummary.metadata.nodeCount.toLocaleString()} nodes, ${heapSummary.detachedNodes.count} detached DOM nodes
Network: ${reqCount} requests, ${formatBytes(totalTransfer)} transferred, ${renderBlocking} render-blocking${runtimeInfo}`;
}

/**
 * Build the four specialized subagent definitions with file lists
 * injected near the TOP of their system prompts.
 */
function buildSubagents(ctx?: PageLoadContext): SubAgent[] {
  const fileSection = ctx ? buildBrowserFileListSection(ctx) : '';

  const inject = (prompt: string) => insertFileListIntoPrompt(prompt, fileSection);

  return [
    {
      name: 'memory-heap',
      description:
        'Analyzes heap snapshot data to find detached DOM nodes, large retained objects, constructor hotspots, and closure leaks.',
      systemPrompt: inject(MEMORY_HEAP_PROMPT),
    },
    {
      name: 'page-load',
      description:
        'Analyzes page load performance to find render-blocking resources, large bundles, and sequential waterfalls.',
      systemPrompt: inject(PAGE_LOAD_PROMPT),
    },
    {
      name: 'runtime-blocking',
      description:
        'Analyzes Chrome runtime traces to find main-thread blocking functions, event listener leaks, GC pressure, and layout thrashing.',
      systemPrompt: inject(RUNTIME_BLOCKING_PROMPT),
    },
    {
      name: 'code-pattern',
      description:
        'Detects frontend code anti-patterns: inline scripts, DOM manipulation in loops, missing event delegation, non-passive listeners.',
      systemPrompt: inject(CODE_PATTERN_PROMPT),
    },
  ];
}

/**
 * Analyze page-load performance data using a single Deep Agent orchestrator
 * with four specialized subagents, each focused on a different category of
 * performance issue.
 *
 * File lists are baked into each subagent's system prompt at construction
 * time so they read files directly without ls/glob discovery.
 */
export async function analyze(
  model: BaseChatModel,
  backend: BackendProtocol,
  spinner: Ora,
  context?: PageLoadContext,
  { animateProgress = true }: { animateProgress?: boolean } = {},
): Promise<Finding[]> {
  const subagents = buildSubagents(context);

  const agent = createDeepAgent({
    model,
    systemPrompt: BROWSER_ORCHESTRATOR_PROMPT,
    backend,
    subagents,
    responseFormat: toolStrategy(FindingsSchema),
  });

  const userMessage = context
    ? buildBrowserUserMessage(context)
    : [
        'Analyze the frontend performance data in this workspace.',
        '',
        'Start by reading /heap/summary.json, /trace/summary.json, and /trace/runtime/summary.json',
        'to understand the overall picture, then explore source files to verify root causes.',
      ].join('\n');

  const result = await invokeWithTodoStreaming(agent, userMessage, spinner, { animateProgress });
  const findings = result.structuredResponse?.findings;
  if (!Array.isArray(findings)) {
    throw new Error(`Agent did not return structured findings: ${result.messages.at(-1)?.text}`);
  }

  // Deduplicate and rank findings from the orchestrator + subagent results
  const deduped = deduplicateFindings(findings);
  return rankFindings(deduped);
}
