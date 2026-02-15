import { createDeepAgent, type BackendProtocol } from 'deepagents';
import { toolStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Ora } from 'ora';

import { SYSTEM_PROMPT } from './prompts.js';
import {
  FindingsSchema,
  invokeWithTodoStreaming,
  formatBytes,
  type Finding,
  type HeapSummary,
  type TraceResult,
} from '@zeitzeuge/utils';

/** Context for building a dynamic page-load user message. */
export interface PageLoadContext {
  url: string;
  heapSummary: HeapSummary;
  traceResult: TraceResult;
}

/**
 * Build a factual user message for page-load analysis from captured data.
 * Surfaces raw numbers only — no diagnoses or severity labels.
 */
function buildPageLoadUserMessage(ctx: PageLoadContext): string {
  const { url, heapSummary, traceResult } = ctx;
  const m = traceResult.metrics;
  const reqCount = traceResult.networkRequests.length;
  const renderBlocking = traceResult.networkRequests.filter((r) => r.isRenderBlocking).length;
  const totalTransfer = traceResult.networkRequests.reduce((s, r) => s + r.encodedSize, 0);
  const hasRuntime = !!traceResult.runtimeTrace;

  const lines: string[] = [
    'Analyze the frontend performance data in this workspace.',
    '',
    `URL: ${url}`,
    `Page load: ${Math.round(m.loadComplete)}ms | FCP: ${Math.round(m.firstContentfulPaint)}ms | LCP: ${Math.round(m.largestContentfulPaint)}ms | TBT: ${Math.round(m.totalBlockingTime)}ms`,
    `Heap: ${formatBytes(heapSummary.metadata.totalSize)} total, ${heapSummary.metadata.nodeCount.toLocaleString()} nodes, ${heapSummary.detachedNodes.count} detached DOM nodes`,
    `Network: ${reqCount} requests, ${formatBytes(totalTransfer)} transferred, ${renderBlocking} render-blocking`,
    `Long tasks: ${m.longTasks.length}`,
  ];

  if (hasRuntime) {
    const rt = traceResult.runtimeTrace!;
    lines.push(
      `Runtime trace: ${rt.blockingFunctions.length} blocking functions, ${rt.gcEvents.length} GC events (${Math.round(rt.gcEvents.reduce((s, e) => s + e.duration, 0))}ms total)`,
    );
  }

  lines.push(
    '',
    'Available data:',
    '- /heap/summary.json — parsed heap snapshot',
    '- /trace/summary.json — page load metrics',
    '- /trace/network-waterfall.json — request timing and sizes',
    '- /trace/asset-manifest.json — index of stored assets',
  );

  if (hasRuntime) {
    lines.push(
      '- /trace/runtime/summary.json — runtime trace overview',
      '- /trace/runtime/blocking-functions.json — main thread blocking functions',
      '- /trace/runtime/event-listeners.json — listener add/remove counts',
      '- /trace/runtime/frame-breakdown.json — scripting vs layout vs paint vs GC',
      '- /trace/runtime/raw-events.json — full Chrome trace events',
    );
  }

  lines.push(
    '- /scripts/ — JavaScript source files',
    '- /styles/ — CSS source files',
    '- /html/document.html — page markup',
    '',
    'Explore the workspace, read source files to verify root causes, and provide code-level fixes.',
  );

  return lines.join('\n');
}

/**
 * Analyze performance data using a Deep Agent that explores
 * the workspace containing heap + trace data + source files.
 */
export async function analyze(
  model: BaseChatModel,
  backend: BackendProtocol,
  spinner: Ora,
  context?: PageLoadContext,
): Promise<Finding[]> {
  const agent = createDeepAgent({
    model,
    systemPrompt: SYSTEM_PROMPT,
    backend,
    responseFormat: toolStrategy(FindingsSchema),
  });

  const userMessage = context
    ? buildPageLoadUserMessage(context)
    : [
        'Analyze the frontend performance data in this workspace.',
        '',
        'Start by reading /heap/summary.json, /trace/summary.json, and /trace/runtime/summary.json',
        'to understand the overall picture, then explore source files to verify root causes.',
      ].join('\n');

  const result = await invokeWithTodoStreaming(agent, userMessage, spinner);
  const findings = result.structuredResponse.findings;
  if (!Array.isArray(findings)) {
    throw new Error('Agent did not return structured findings.');
  }

  return findings;
}
