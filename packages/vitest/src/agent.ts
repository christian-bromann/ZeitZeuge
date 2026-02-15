import { createDeepAgent, type BackendProtocol } from 'deepagents';
import { toolStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Ora } from 'ora';

import { VITEST_SYSTEM_PROMPT } from './prompts.js';
import {
  FindingsSchema,
  invokeWithTodoStreaming,
  type Finding,
  type PerformanceMetrics,
} from '@zeitzeuge/utils';

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
  { animateProgress = true }: { animateProgress?: boolean } = {},
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

  const result = await invokeWithTodoStreaming(agent, userMessage, spinner, { animateProgress });
  const findings = result.structuredResponse?.findings;
  if (!Array.isArray(findings)) {
    throw new Error(`Failed to analyze test performance: ${result.messages.at(-1)?.text}`);
  }

  return findings;
}
