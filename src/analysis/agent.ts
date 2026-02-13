import { createDeepAgent, type BackendProtocol } from 'deepagents';
import { providerStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';

import { SYSTEM_PROMPT } from './prompts.js';
import { VITEST_SYSTEM_PROMPT } from '../vitest/prompts.js';
import { FindingsSchema } from '../schema.js';
import type { Finding } from '../types.js';

/**
 * Analyze performance data using a Deep Agent that explores
 * the workspace containing heap + trace data + source files.
 */
export async function analyze(model: BaseChatModel, backend: BackendProtocol): Promise<Finding[]> {
  const agent = createDeepAgent({
    model,
    systemPrompt: SYSTEM_PROMPT,
    backend,
    responseFormat: providerStrategy(FindingsSchema),
  });

  const userMessage = [
    'Analyze the frontend performance data in this workspace.',
    '',
    'The workspace contains heap snapshot data, page-load trace data, and Chrome runtime trace data.',
    '',
    'Start by reading /heap/summary.json, /trace/summary.json, and /trace/runtime/summary.json',
    'to understand the overall picture. Then explore:',
    '',
    '- /trace/network-waterfall.json for request timing',
    '- /trace/runtime/blocking-functions.json for function-level main thread blocking',
    '- /trace/runtime/event-listeners.json for listener add/remove imbalances',
    '- /trace/runtime/frame-breakdown.json for frame breakdown (scripting vs layout vs paint vs GC)',
    '- /scripts/ for the actual JavaScript source code',
    '- /styles/ for CSS source',
    '- /html/document.html for the page markup',
    '',
    'Look for memory issues (from the heap data), page-load issues (from the network trace),',
    'and runtime issues (from the Chrome trace — blocking functions, listener leaks, GC pressure).',
    'When you find a problem, read the actual source file to provide a specific, code-level fix.',
  ].join('\n');

  const result = await agent.invoke({
    messages: [{ role: 'user', content: userMessage }],
  });

  return result.structuredResponse.findings;
}

/**
 * Analyze Vitest test performance data using a Deep Agent that explores
 * the workspace containing CPU profiles + test timing + source files.
 */
export async function analyzeTestPerformance(
  model: BaseChatModel,
  backend: BackendProtocol,
): Promise<Finding[]> {
  const agent = createDeepAgent({
    model,
    systemPrompt: VITEST_SYSTEM_PROMPT,
    backend,
    responseFormat: providerStrategy(FindingsSchema),
  });

  const userMessage = [
    'Analyze the performance of the APPLICATION CODE being tested in this Vitest workspace.',
    '',
    'Follow this order:',
    "1. Read /hot-functions/application.json — these are the hotspots IN the user's own code",
    '2. Read /scripts/application.json — per-file CPU time for application source files',
    '3. Read /hot-functions/dependencies.json — expensive dependency calls',
    '4. If present, read /heap-profiles/index.json and /heap-profiles/<file>.json for allocation hotspots',
    '5. Read /summary.json and /timing/overview.json for the big picture',
    '6. Read CPU profiles in /profiles/ for detailed call trees',
    '7. Read source files in /src/ and /tests/ to understand root causes and propose code-level fixes',
    '',
    'Focus findings on the APPLICATION code — what can the developer change in their own codebase',
    'to improve performance? Dependency bottlenecks are worth reporting if the developer can',
    'reduce how they call the dependency or choose an alternative.',
  ].join('\n');

  const result = await agent.invoke({
    messages: [{ role: 'user', content: userMessage }],
  });

  return result.structuredResponse.findings;
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
