import { setMaxListeners } from 'node:events';
import {
  createDeepAgent,
  type BackendProtocol,
  type DeepAgent,
  type DeepAgentTypeConfig,
} from 'deepagents';
import { toolStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Ora } from 'ora';

import { SYSTEM_PROMPT } from './prompts.js';
import { VITEST_SYSTEM_PROMPT } from '../vitest/prompts.js';
import { FindingsSchema } from '../schema.js';
import { TodoProgressRenderer } from '../output/progress.js';
import type { Finding, HeapSummary, TraceResult } from '../types.js';
import type { PerformanceMetrics } from '../vitest/metrics.js';

/**
 * Check whether a LangGraph subgraph namespace string refers to a
 * subagent.  Subagent namespaces contain a `tools:` segment.
 */
function isSubagentNamespace(ns: unknown): boolean {
  if (typeof ns === 'string') return ns.includes('tools:');
  if (Array.isArray(ns)) return ns.some((s) => typeof s === 'string' && s.includes('tools:'));
  return false;
}

/**
 * Invoke the Deep Agent with todo streaming.
 *
 * Enables `subgraphs: true` so that tool calls made by subagents
 * (spawned via the `task` tool) also appear in the progress output.
 *
 * @param agent - The Deep Agent to use.
 * @param userMessage - The user message to send to the agent.
 * @returns The last values from the stream.
 * @throws If the agent does not return structured findings.
 */
async function invokeWithTodoStreaming<TTypes extends DeepAgentTypeConfig>(
  agent: DeepAgent<TTypes>,
  userMessage: string,
  spinner: Ora,
): Promise<ReturnType<typeof agent.invoke>> {
  const renderer = new TodoProgressRenderer(spinner);

  // Prevent "MaxListenersExceededWarning" on the internal AbortSignal.
  // Long-running agent loops with subgraphs can accumulate many
  // listeners on the same signal; raising the limit avoids the warning.
  const controller = new AbortController();
  setMaxListeners(0, controller.signal);

  const stream = await agent.stream(
    { messages: [{ role: 'user', content: userMessage }] } as any,
    { streamMode: ['updates', 'values'], subgraphs: true, signal: controller.signal } as any,
  );

  let lastValues: unknown;

  for await (const item of stream as AsyncIterable<unknown>) {
    if (!Array.isArray(item)) {
      // Fallback: raw chunk (single streamMode, no subgraphs).
      renderer.handleChunk(item);
      lastValues = item;
      continue;
    }

    // With subgraphs: true  → [namespace, mode, chunk]  (3 elements)
    // Without subgraphs     → [mode, chunk]             (2 elements)
    if (item.length === 3) {
      const [ns, mode, chunk] = item;
      const isSubagent = isSubagentNamespace(ns);
      renderer.handleChunk(chunk, { isSubagent });
      // Only track main-agent "values" as the authoritative final state.
      if (!isSubagent && mode === 'values') lastValues = chunk;
      continue;
    }

    if (item.length === 2) {
      const [mode, chunk] = item;
      renderer.handleChunk(chunk);
      if (mode === 'values') lastValues = chunk;
      continue;
    }
  }

  return lastValues as ReturnType<typeof agent.invoke>;
}

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

/** Context for building a dynamic Vitest user message. */
export interface VitestAnalysisContext {
  metrics: PerformanceMetrics;
  hasHeapProfiles: boolean;
  hasListenerTracking: boolean;
}

/**
 * Build a factual user message for Vitest analysis from collected metrics.
 * Surfaces raw numbers only — no diagnoses or severity labels.
 */
function buildVitestUserMessage(ctx: VitestAnalysisContext): string {
  const { metrics, hasHeapProfiles, hasListenerTracking } = ctx;

  const lines: string[] = [
    'Analyze the performance of the APPLICATION CODE being tested in this Vitest workspace.',
    '',
    `Test suite: ${metrics.suite.totalTests} tests, total duration ${metrics.suite.totalDuration}ms`,
    `CPU breakdown: application ${metrics.cpu.applicationPercent}%, dependencies ${metrics.cpu.dependencyPercent}%, GC ${metrics.cpu.gcPercentage}%, idle ${metrics.cpu.idlePercentage}%`,
    `Slowest file: ${metrics.suite.slowestFile} (${metrics.suite.slowestFileDuration}ms)`,
    `Slowest test: ${metrics.suite.slowestTestName} (${metrics.suite.slowestTestDuration}ms)`,
    '',
    'Available data:',
    '- /hot-functions/application.json — application-level CPU hotspots',
    '- /scripts/application.json — per-file CPU time for application code',
    '- /hot-functions/dependencies.json — dependency CPU hotspots',
    '- /scripts/dependencies.json — per-file CPU time for dependencies',
  ];

  if (hasListenerTracking) {
    lines.push('- /listener-tracking.json — event listener add/remove patterns and exceedances');
  }

  if (hasHeapProfiles) {
    lines.push(
      '- /heap-profiles/index.json — heap profile manifest',
      '- /heap-profiles/<file>.json — per-file allocation hotspots',
    );
  }

  lines.push(
    '- /summary.json — overall test run summary',
    '- /timing/overview.json — per-file test durations',
    '- /timing/slow-tests.json — tests exceeding the slow threshold',
    '- /profiles/ — full CPU profile summaries with call trees',
    '- /metrics/current.json — pre-computed aggregate metrics',
    '- /src/ and /tests/ — source files',
    '',
    'Focus findings on the APPLICATION code — what can the developer change in their own',
    'codebase to improve performance? Read source files to verify root causes before suggesting fixes.',
  );

  return lines.join('\n');
}

/**
 * Analyze Vitest test performance data using a Deep Agent that explores
 * the workspace containing CPU profiles + test timing + source files.
 */
export async function analyzeTestPerformance(
  model: BaseChatModel,
  backend: BackendProtocol,
  spinner: Ora,
  context?: VitestAnalysisContext,
): Promise<Finding[]> {
  const agent = createDeepAgent({
    model,
    systemPrompt: VITEST_SYSTEM_PROMPT,
    backend,
    responseFormat: toolStrategy(FindingsSchema),
  });

  const userMessage = context
    ? buildVitestUserMessage(context)
    : [
        'Analyze the performance of the APPLICATION CODE being tested in this Vitest workspace.',
        '',
        'Start with /hot-functions/application.json, then explore source files to verify',
        'root causes and provide code-level fixes.',
      ].join('\n');

  const result = await invokeWithTodoStreaming(agent, userMessage, spinner);
  const findings = result.structuredResponse?.findings;
  if (!Array.isArray(findings)) {
    throw new Error(`Failed to analyze test performance: ${result.messages.at(-1)?.text}`);
  }

  return findings;
}

/**
 * Format bytes into a human-readable string.
 * Kept for backwards compatibility with existing imports.
 */
export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}
