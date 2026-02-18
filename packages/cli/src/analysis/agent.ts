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

/** Workspace source files categorised by type. */
interface CategorisedFiles {
  scripts: string[];
  styles: string[];
  html: string[];
}

/** Categorise workspace file paths into scripts, styles, and HTML. */
function categoriseWorkspaceFiles(workspaceFiles: string[]): CategorisedFiles {
  return {
    scripts: workspaceFiles.filter((f) => f.startsWith('/scripts/')),
    styles: workspaceFiles.filter((f) => f.startsWith('/styles/')),
    html: workspaceFiles.filter((f) => f.startsWith('/html/')),
  };
}

/**
 * Build a per-agent file list section.
 *
 * Each agent gets only its relevant DATA files as primary reads, and
 * source files are listed as "available for selective reading" — NOT
 * as files that must ALL be read in the first turn.
 */
function buildAgentFileListSection(agentName: string, ctx: PageLoadContext): string {
  const { traceResult, workspaceFiles = [] } = ctx;
  const hasRuntime = !!traceResult.runtimeTrace;
  const files = categoriseWorkspaceFiles(workspaceFiles);

  let dataFiles: FileListConfig['dataFiles'] = [];
  switch (agentName) {
    case 'memory-heap':
      dataFiles = [
        { path: '/heap/summary.json', description: '(parsed heap snapshot — your PRIMARY data)' },
      ];
      break;
    case 'page-load':
      dataFiles = [
        {
          path: '/trace/summary.json',
          description: '(page load metrics + render-blocking resources)',
        },
        { path: '/trace/network-waterfall.json', description: '(request timing and sizes)' },
        { path: '/trace/asset-manifest.json', description: '(index of stored assets)' },
      ];
      break;
    case 'runtime-blocking':
      if (hasRuntime) {
        dataFiles = [
          { path: '/trace/runtime/summary.json', description: '(runtime trace overview)' },
          {
            path: '/trace/runtime/blocking-functions.json',
            description: '(main thread blocking functions)',
          },
          {
            path: '/trace/runtime/event-listeners.json',
            description: '(listener add/remove counts)',
          },
          {
            path: '/trace/runtime/frame-breakdown.json',
            description: '(scripting vs layout vs paint vs GC)',
          },
        ];
      }
      break;
    case 'code-pattern':
      dataFiles = [
        ...files.html.map((f) => ({ path: f, description: '(HTML document — check first)' })),
        ...files.styles.map((f) => ({ path: f, description: '(CSS source — check first)' })),
      ];
      break;
  }

  // Only code-pattern and page-load need a source file listing.
  // memory-heap and runtime-blocking derive file paths from their data
  // (heap retainer paths contain script URLs, blocking-functions.json has
  // scriptUrl fields) so they don't need a pre-enumerated list.
  const additionalSections: FileListConfig['additionalSections'] = [];
  if (agentName === 'code-pattern') {
    if (files.scripts.length > 0) {
      additionalSections.push({
        title: 'Available script files — read selectively based on issues found in HTML/CSS',
        files: files.scripts,
      });
    }
  } else if (agentName === 'page-load') {
    const allSource = [...files.scripts, ...files.styles, ...files.html];
    if (allSource.length > 0) {
      additionalSections.push({
        title: 'Available source files — read ONLY the ones flagged as problematic in trace data',
        files: allSource,
      });
    }
  }

  return buildFileListPromptSection({
    dataFiles,
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
  const { url, heapSummary, traceResult } = ctx;
  const m = traceResult.metrics;
  const reqCount = traceResult.networkRequests.length;
  const renderBlocking = traceResult.networkRequests.filter((r) => r.isRenderBlocking).length;
  const totalTransfer = traceResult.networkRequests.reduce((s, r) => s + r.encodedSize, 0);
  const hasRuntime = !!traceResult.runtimeTrace;

  let runtimeInfo = '';
  if (hasRuntime) {
    const rt = traceResult.runtimeTrace!;
    runtimeInfo = `\nRuntime trace: ${rt.blockingFunctions.length} blocking functions, ${rt.gcEvents.length} GC events (${Math.round(rt.gcEvents.reduce((s, e) => s + e.duration, 0))}ms total)`;
  }

  return `Dispatch all 4 subagent tasks NOW in a single response.
Use these EXACT descriptions (copy them verbatim):

TASK 1 — subagent_type: "memory-heap"
description: "Find memory issues: detached DOM nodes, large retained objects, constructor hotspots, closure leaks, and unbounded caches. Read /heap/summary.json FIRST (do NOT read source files yet). Analyze it for issues, then read ONLY the source files referenced by those issues to verify root causes. Report each distinct issue as a separate finding. Do NOT suggest code fixes for minified/compiled JS — describe the fix approach in the description instead."

TASK 2 — subagent_type: "page-load"
description: "Find page load issues: render-blocking scripts/CSS, large bundles, sequential waterfalls, and uncompressed resources. Read /trace/summary.json, /trace/network-waterfall.json, and /trace/asset-manifest.json FIRST (do NOT read source files yet). Identify problematic resources, then read ONLY the flagged scripts/styles to verify. Report each distinct issue as a separate finding. Do NOT suggest code fixes for minified/compiled JS."

TASK 3 — subagent_type: "runtime-blocking"
description: "Find runtime issues: main-thread blocking functions, event listener imbalances, GC pressure, layout thrashing, and unthrottled event handlers. Read /trace/runtime/ data files FIRST (do NOT read source files yet). Analyze blocking-functions.json for functions >50ms, event-listeners.json for add/remove imbalances. Then read ONLY the source files at the reported locations. Check for compound blockers (A calls blocking B — report BOTH). Report each distinct issue as a separate finding. Do NOT suggest code fixes for minified/compiled JS."

TASK 4 — subagent_type: "code-pattern"
description: "Find frontend code anti-patterns: inline scripts, DOM manipulation in loops, missing event delegation, synchronous XHR, non-passive listeners, CSS issues, and missing image dimensions. Read HTML and CSS files FIRST. Check for inline <script> blocks, <img> without width/height, CSS @import. Then read ONLY the script files referenced by issues found. Report each pattern as a separate finding. Do NOT suggest code fixes for minified/compiled JS."

URL: ${url}
Page load: ${Math.round(m.loadComplete)}ms | FCP: ${Math.round(m.firstContentfulPaint)}ms | LCP: ${Math.round(m.largestContentfulPaint)}ms | TBT: ${Math.round(m.totalBlockingTime)}ms
Heap: ${formatBytes(heapSummary.metadata.totalSize)} total, ${heapSummary.metadata.nodeCount.toLocaleString()} nodes, ${heapSummary.detachedNodes.count} detached DOM nodes
Network: ${reqCount} requests, ${formatBytes(totalTransfer)} transferred, ${renderBlocking} render-blocking${runtimeInfo}`;
}

/**
 * Build the four specialized subagent definitions with per-agent file
 * lists injected near the TOP of their system prompts.
 *
 * Each agent only sees its relevant data files as primary reads and
 * source files as "available for selective reading".
 */
function buildSubagents(ctx?: PageLoadContext): SubAgent[] {
  const agentDefs: Array<{ name: string; description: string; prompt: string }> = [
    {
      name: 'memory-heap',
      description:
        'Analyzes heap snapshot data to find detached DOM nodes, large retained objects, constructor hotspots, and closure leaks.',
      prompt: MEMORY_HEAP_PROMPT,
    },
    {
      name: 'page-load',
      description:
        'Analyzes page load performance to find render-blocking resources, large bundles, and sequential waterfalls.',
      prompt: PAGE_LOAD_PROMPT,
    },
    {
      name: 'runtime-blocking',
      description:
        'Analyzes Chrome runtime traces to find main-thread blocking functions, event listener leaks, GC pressure, and layout thrashing.',
      prompt: RUNTIME_BLOCKING_PROMPT,
    },
    {
      name: 'code-pattern',
      description:
        'Detects frontend code anti-patterns: inline scripts, DOM manipulation in loops, missing event delegation, non-passive listeners.',
      prompt: CODE_PATTERN_PROMPT,
    },
  ];

  return agentDefs.map(({ name, description, prompt }) => {
    const fileSection = ctx ? buildAgentFileListSection(name, ctx) : '';
    return {
      name,
      description,
      systemPrompt: insertFileListIntoPrompt(prompt, fileSection),
    };
  });
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
