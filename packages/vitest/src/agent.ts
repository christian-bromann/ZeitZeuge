import { createDeepAgent, type BackendProtocol, type SubAgent } from 'deepagents';
import { toolStrategy } from 'langchain';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { Ora } from 'ora';

import { VITEST_SYSTEM_PROMPT } from './prompts.js';
import { CPU_HOTSPOT_PROMPT } from './prompts/cpu-hotspot.js';
import { LISTENER_LEAK_PROMPT } from './prompts/listener-leak.js';
import { MEMORY_CLOSURE_PROMPT } from './prompts/memory-closure.js';
import { CODE_PATTERN_PROMPT } from './prompts/code-pattern.js';
import { deduplicateFindings, rankFindings } from './deduplication.js';
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
  /** Workspace-relative paths to application source files. */
  sourceFiles?: string[];
  /** Workspace-relative paths to test files. */
  testFiles?: string[];
}

/**
 * Build the file-list section that gets injected near the TOP of each subagent's
 * system prompt (right after the intro, before focus areas).
 *
 * This ensures subagents see the exact file paths FIRST, before any analysis
 * instructions, so they read files directly without ls/glob discovery.
 */
function buildFileListPromptSection(ctx: VitestAnalysisContext): string {
  const { sourceFiles, testFiles, hasListenerTracking, hasHeapProfiles } = ctx;

  const lines: string[] = [
    '## FILES IN THIS WORKSPACE — Read these directly. Do NOT use ls or glob.',
    '',
    '### Data files',
    '- /hot-functions/application.json (hot functions with selfTime, selfPercent, sourceSnippet)',
    '- /scripts/application.json (per-script time breakdown)',
    '- /profiles/index.json (manifest of CPU profiles)',
  ];

  if (hasListenerTracking) {
    lines.push('- /listener-tracking.json (event listener add/remove counts and exceedances)');
  }

  if (hasHeapProfiles) {
    lines.push('- /heap-profiles/index.json');
  }

  lines.push('- /summary.json (overall test run stats)', '- /metrics/current.json');

  if (sourceFiles && sourceFiles.length > 0) {
    lines.push('', '### Application source files — you MUST read ALL of these in your FIRST turn');
    for (const f of sourceFiles) {
      lines.push(`- ${f}`);
    }
  }

  if (testFiles && testFiles.length > 0) {
    lines.push('', '### Test files');
    for (const f of testFiles) {
      lines.push(`- ${f}`);
    }
  }

  lines.push('', '> IMPORTANT: The file paths above are COMPLETE. Do NOT use ls or glob to');
  lines.push('> discover files. Just call read_file for each path listed above.');

  return lines.join('\n');
}

/**
 * Insert the file list section near the TOP of a subagent prompt,
 * right after the intro paragraph(s) and before the first ## heading.
 *
 * This ensures the file list is one of the first things the agent reads,
 * not buried at the bottom of a long prompt.
 */
function insertFileListIntoPrompt(prompt: string, fileSection: string): string {
  if (!fileSection) return prompt;

  // Find the first ## heading in the prompt
  const firstHeadingIdx = prompt.indexOf('\n## ');
  if (firstHeadingIdx === -1) {
    // No headings found, append at end
    return prompt + '\n\n' + fileSection;
  }

  // Insert the file list between the intro paragraphs and the first heading
  return (
    prompt.slice(0, firstHeadingIdx) + '\n\n' + fileSection + '\n' + prompt.slice(firstHeadingIdx)
  );
}

/**
 * Build a user message for the orchestrator.
 *
 * Includes the COMPLETE task descriptions with file paths so the orchestrator
 * copies them verbatim into each subagent's task description (user message).
 * This is critical: the file list in the task description (user message) has
 * much higher salience than the system prompt for the subagent model.
 */
function buildVitestUserMessage(ctx: VitestAnalysisContext): string {
  const { metrics, sourceFiles = [], hasListenerTracking } = ctx;

  // Build the file list that each subagent needs to read
  const srcFiles = sourceFiles.map((f) => `  ${f}`).join('\n');
  const dataFiles = [
    '  /hot-functions/application.json',
    '  /scripts/application.json',
    hasListenerTracking ? '  /listener-tracking.json' : '',
  ]
    .filter(Boolean)
    .join('\n');
  const allFiles = `${dataFiles}\n${srcFiles}`;

  return `Dispatch all 4 subagent tasks NOW in a single response.
Use these EXACT descriptions (copy them verbatim):

TASK 1 — subagent_type: "cpu-hotspot"
description: "Find blocking/event-loop-blocking operations and excessive object instantiation.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze for: synchronous CPU-bound loops, compound blockers (A calls blocking B — report BOTH), and per-call object creation (new TextEncoder, new RegExp, new Date in sort comparators). Report each distinct issue as a separate finding with beforeCode and afterCode."

TASK 2 — subagent_type: "listener-leak"
description: "Find event listener leaks, add/remove imbalances, and maxListeners exceedances.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze for: listeners added without removal, missing unsubscribe mechanisms, maxListeners threshold exceedances. Report each pattern as a separate finding with beforeCode and afterCode."

TASK 3 — subagent_type: "memory-closure"
description: "Find closure-based memory leaks, unbounded data structures, and missing cleanup/eviction.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then analyze for: closures capturing outer-scope data, unbounded arrays/Maps/Sets with no eviction, closures capturing transient objects. A single class can have 3+ separate issues — report each one. Include beforeCode and afterCode for every finding."

TASK 4 — subagent_type: "code-pattern"
description: "Find O(n²) algorithms, unnecessary JSON serialization, regex recompilation, and expensive sort comparators.
In your FIRST response, call read_file for ALL of these files (do NOT use ls or glob):
${allFiles}
Read EVERY file above in ONE batch. Then check EVERY function for: nested loops/filter-inside-loop, JSON.parse(JSON.stringify(...)) cloning, new RegExp with constant patterns, sort comparators that create objects. Report each pattern as a separate finding with beforeCode and afterCode."

Test suite: ${metrics.suite.totalTests} tests, ${metrics.suite.totalDuration}ms
CPU: app ${metrics.cpu.applicationPercent}%, deps ${metrics.cpu.dependencyPercent}%, GC ${metrics.cpu.gcPercentage}%`;
}

/**
 * Build the four specialized subagent definitions with file lists
 * injected near the TOP of their system prompts so they read files
 * directly without ls/glob discovery.
 */
function buildSubagents(ctx?: VitestAnalysisContext): SubAgent[] {
  const fileSection = ctx ? buildFileListPromptSection(ctx) : '';

  const inject = (prompt: string) => insertFileListIntoPrompt(prompt, fileSection);

  return [
    {
      name: 'cpu-hotspot',
      description:
        'Analyzes CPU profiling data to find blocking/event-loop-blocking operations and excessive object instantiation.',
      systemPrompt: inject(CPU_HOTSPOT_PROMPT),
    },
    {
      name: 'listener-leak',
      description:
        'Detects event listener leaks, add/remove imbalances, and maxListeners exceedances.',
      systemPrompt: inject(LISTENER_LEAK_PROMPT),
    },
    {
      name: 'memory-closure',
      description:
        'Finds closure-based memory leaks, unbounded data structures, and missing cleanup/eviction.',
      systemPrompt: inject(MEMORY_CLOSURE_PROMPT),
    },
    {
      name: 'code-pattern',
      description:
        'Detects algorithmic inefficiencies (O(n²)), unnecessary serialization, regex recompilation, and expensive sort comparators.',
      systemPrompt: inject(CODE_PATTERN_PROMPT),
    },
  ];
}

/**
 * Analyze Vitest test performance data using a single Deep Agent orchestrator
 * with four specialized subagents, each focused on a different category of
 * performance flaw.
 *
 * File lists are baked into each subagent's system prompt at construction
 * time so they read files directly without ls/glob discovery.
 */
export async function analyzeTestPerformance(
  model: BaseChatModel,
  backend: BackendProtocol,
  spinner: Ora,
  context?: VitestAnalysisContext,
  { animateProgress = true }: { animateProgress?: boolean } = {},
): Promise<Finding[]> {
  const subagents = buildSubagents(context);

  const agent = createDeepAgent({
    model,
    systemPrompt: VITEST_SYSTEM_PROMPT,
    backend,
    subagents,
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

  // Deduplicate and rank findings from the orchestrator + subagent results
  const deduped = deduplicateFindings(findings);
  return rankFindings(deduped);
}
