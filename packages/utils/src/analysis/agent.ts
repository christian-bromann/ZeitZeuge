import { setMaxListeners } from 'node:events';
import type { DeepAgent, DeepAgentTypeConfig } from 'deepagents';
import type { Ora } from 'ora';

import { TodoProgressRenderer } from '../output/progress.js';

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
export async function invokeWithTodoStreaming<TTypes extends DeepAgentTypeConfig>(
  agent: DeepAgent<TTypes>,
  userMessage: string,
  spinner: Ora,
  { animateProgress = true }: { animateProgress?: boolean } = {},
): Promise<ReturnType<typeof agent.invoke>> {
  const renderer = new TodoProgressRenderer(spinner, { animate: animateProgress });

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
      renderer.handleChunk(chunk, { isSubagent, namespace: ns });
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
