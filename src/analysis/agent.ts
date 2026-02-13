import { createDeepAgent, type BackendProtocol } from 'deepagents';
import { providerStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { z } from 'zod';
import { SYSTEM_PROMPT } from './prompts.js';
import { VITEST_SYSTEM_PROMPT } from '../vitest/prompts.js';
import type { Finding } from '../types.js';

/**
 * All finding categories — shared between page-load and test-performance analysis.
 */
const ALL_CATEGORIES = [
  // Page-load / runtime categories
  'memory-leak',
  'large-retained-object',
  'detached-dom',
  'render-blocking',
  'long-task',
  'unused-code',
  'waterfall-bottleneck',
  'large-asset',
  'frame-blocking-function',
  'listener-leak',
  'gc-pressure',
  // Test / application performance categories
  'slow-test',
  'expensive-setup',
  'hot-function',
  'unnecessary-computation',
  'import-overhead',
  'dependency-bottleneck',
  'other',
] as const;

const FindingSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().describe('Short title for the finding'),
  description: z.string().describe('Detailed explanation of the issue'),
  category: z.enum(ALL_CATEGORIES).describe('Category of the performance issue'),
  resourceUrl: z.string().optional().describe('URL of the resource involved'),
  workspacePath: z.string().optional().describe('Path in the VFS workspace'),
  impactMs: z.number().optional().describe('Impact on page load time in ms'),
  retainedSize: z.number().optional().describe('Retained heap size in bytes'),
  retainerPath: z.array(z.string()).optional().describe('Object retention path in the heap'),
  suggestedFix: z.string().describe('Code snippet or guidance to fix the issue'),
  testFile: z.string().optional().describe('Test file path (for test performance findings)'),
  hotFunction: z
    .object({
      name: z.string(),
      scriptUrl: z.string(),
      lineNumber: z.number(),
      selfTime: z.number(),
      selfPercent: z.number(),
    })
    .optional()
    .describe('Hot function details (for hot-function findings)'),
});

const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
});

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
    '4. Read /summary.json and /timing/overview.json for the big picture',
    '5. Read CPU profiles in /profiles/ for detailed call trees',
    '6. Read source files in /src/ and /tests/ to understand root causes and propose code-level fixes',
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
