/**
 * Thorough unit tests for TodoProgressRenderer.
 *
 * Tests cover:
 * - Tool-call extraction from LangGraph "updates" and "values" stream chunks
 * - Tool-call display formatting and deduplication
 * - Todo progress tracking ([completed/total] prefix)
 * - Integration with a real DeepAgent + FakeToolCallingModel
 */

import { test, expect, describe, beforeEach } from 'bun:test';

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { AIMessage } from '@langchain/core/messages';
import type { BaseMessage } from '@langchain/core/messages';
import { BaseChatModel } from '@langchain/core/language_models/chat_models';
import type { CallbackManagerForLLMRun } from '@langchain/core/callbacks/manager';
import { createDeepAgent, FilesystemBackend, type SubAgent } from 'deepagents';
import { toolStrategy } from 'langchain';
import type { Ora } from 'ora';

import { analyzeTestPerformance } from '@zeitzeuge/vitest';

import { FindingsSchema } from '../../src/schema';
import { TodoProgressRenderer } from '../../src/output/progress';

/** Strip ANSI escape codes for clean assertions. */
function stripAnsi(str: string): string {
  // eslint-disable-next-line no-control-regex
  const ANSI_RE = new RegExp('\x1B' + '\\[[0-9;]*m', 'g');
  return str.replace(ANSI_RE, '');
}

interface PersistedEntry {
  symbol?: string;
  text?: string;
}

/**
 * A lightweight mock of the `Ora` spinner that records all
 * `stopAndPersist` calls and text changes for assertions.
 */
class MockSpinner {
  text = '';
  startCount = 0;
  persisted: PersistedEntry[] = [];

  start() {
    this.startCount++;
    return this;
  }

  stop() {
    return this;
  }

  stopAndPersist(opts?: PersistedEntry) {
    this.persisted.push(opts ?? {});
    return this;
  }

  /** Get all persisted texts with ANSI codes stripped. */
  persistedTexts(): string[] {
    return this.persisted.map((p) => stripAnsi(p.text ?? ''));
  }
}

function createMockSpinner(text = 'Analyzing...'): MockSpinner {
  const s = new MockSpinner();
  s.text = text;
  return s;
}

// ── FakeToolCallingModel ────────────────────────────────────

/**
 * A builder function that receives bound tool names and returns
 * the ordered list of AIMessages the model should produce.
 *
 * The `structuredOutputToolName` is the dynamic name of the
 * tool-strategy response tool (e.g. `"extract-1"`), so the final
 * message in the sequence can call it to terminate the agent.
 */
type MessageSequenceBuilder = (boundToolNames: string[]) => AIMessage[];

/**
 * A fake chat model that cycles through a predefined sequence of
 * AIMessage objects.  Each message can optionally include tool_calls.
 *
 * Accepts either:
 *  - A static `AIMessage[]` for simple tests
 *  - A `MessageSequenceBuilder` for integration tests that need to
 *    reference dynamically-named tools (e.g. the structured output tool)
 *
 * Used in the integration test to drive a real DeepAgent without
 * an API key.
 */
class FakeToolCallingModel extends BaseChatModel {
  private callIndex = 0;
  private boundToolNames: string[] = [];
  private builder: MessageSequenceBuilder;
  private _cachedMessages: AIMessage[] | undefined;

  constructor(messagesOrBuilder: AIMessage[] | MessageSequenceBuilder) {
    super({});
    this.builder =
      typeof messagesOrBuilder === 'function' ? messagesOrBuilder : () => messagesOrBuilder;
  }

  override _llmType() {
    return 'fake-tool-calling';
  }

  override _combineLLMOutput() {
    return [];
  }

  /**
   * Capture tool names so the builder can reference them.
   * Returns `this` since our responses are pre-built.
   */
  override bindTools(tools: unknown[]) {
    this.boundToolNames = (tools as Record<string, any>[]).map(
      (t) => t.function?.name ?? t.name ?? 'unknown',
    );
    // Invalidate cache so next _generate rebuilds with new tool names
    this._cachedMessages = undefined;
    return this;
  }

  private get messages(): AIMessage[] {
    if (!this._cachedMessages) {
      this._cachedMessages = this.builder(this.boundToolNames);
    }
    return this._cachedMessages;
  }

  async _generate(
    _messages: BaseMessage[],
    _options: this['ParsedCallOptions'],
    _runManager?: CallbackManagerForLLMRun,
  ) {
    const seq = this.messages;
    const idx = Math.min(this.callIndex, seq.length - 1);
    const msg = seq[idx]!;
    this.callIndex++;
    return {
      generations: [
        {
          message: msg,
          text: typeof msg.content === 'string' ? msg.content : '',
        },
      ],
    };
  }
}

// ── Chunk Factories ─────────────────────────────────────────

/** Simulate an "updates" chunk from the agent/model node. */
function agentUpdateChunk(
  message: Record<string, unknown>,
  todos?: Array<{ id?: string; content: string; status: string }>,
) {
  return { agent: { messages: [message], ...(todos ? { todos } : {}) } };
}

/** Simulate an "updates" chunk from the tools node. */
function toolsUpdateChunk(message: Record<string, unknown>) {
  return { tools: { messages: [message] } };
}

/** Simulate a "values" (full-state) chunk. */
function valuesChunk(
  messages: Record<string, unknown>[],
  todos?: Array<{ id?: string; content: string; status: string }>,
) {
  return { messages, ...(todos ? { todos } : {}) };
}

/** Simulate a direct chunk with only todos (no messages). */
function todoChunk(todos: Array<{ id?: string; content: string; status: string }>) {
  return { todos };
}

/** Build a mock AIMessage-like object with tool_calls. */
function aiMessageWithToolCalls(
  toolCalls: Array<{ id?: string; name: string; args?: Record<string, unknown> }>,
) {
  return {
    content: '',
    tool_calls: toolCalls.map((tc) => ({
      id: tc.id ?? `call_${Math.random().toString(36).slice(2, 8)}`,
      name: tc.name,
      args: tc.args ?? {},
    })),
  };
}

/** Build a mock ToolMessage-like object (result of a tool call). */
function toolMessage(name: string, content: string) {
  return { content, name };
}

// ═════════════════════════════════════════════════════════════
// Tests
// ═════════════════════════════════════════════════════════════

describe('TodoProgressRenderer', () => {
  let spinner: MockSpinner;
  let renderer: TodoProgressRenderer;

  beforeEach(() => {
    spinner = createMockSpinner('Analyzing...');
    renderer = new TodoProgressRenderer(spinner as unknown as Ora);
  });

  // ── Tool call extraction ────────────────────────────────

  describe('tool call extraction', () => {
    test('extracts tool calls from updates-mode agent chunk', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/data.json' } }]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('read_file'))).toBe(true);
      expect(texts.some((t) => t.includes('/data.json'))).toBe(true);
    });

    test('extracts tool calls from values-mode chunk (last message)', () => {
      const humanMsg = { content: 'Analyze the data', role: 'user' };
      const aiMsg = aiMessageWithToolCalls([
        { name: 'grep', args: { pattern: 'TODO', path: '/src' } },
      ]);
      const chunk = valuesChunk([humanMsg, aiMsg]);
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('grep'))).toBe(true);
      expect(texts.some((t) => t.includes('TODO'))).toBe(true);
    });

    test('extracts tool calls from direct chunk (messages at top level)', () => {
      const chunk = {
        messages: [aiMessageWithToolCalls([{ name: 'ls', args: { path: '/src' } }])],
      };
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('ls'))).toBe(true);
    });

    test('extracts multiple tool calls from a single message', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([
          { name: 'read_file', args: { file_path: '/a.json' } },
          { name: 'read_file', args: { file_path: '/b.json' } },
        ]),
      );
      renderer.handleChunk(chunk);

      // Even though there are 2 tool calls, dedup by name means only 1 is printed
      const texts = spinner.persistedTexts();
      const toolLines = texts.filter((t) => t.includes('read_file'));
      expect(toolLines.length).toBe(1);
    });

    test('ignores chunks without tool calls', () => {
      // ToolMessage result (no tool_calls field)
      renderer.handleChunk(toolsUpdateChunk(toolMessage('read_file', 'file contents')));
      // Plain AI message
      renderer.handleChunk(agentUpdateChunk({ content: 'Here is my analysis' }));
      // Empty chunks
      renderer.handleChunk(null);
      renderer.handleChunk(undefined);
      renderer.handleChunk({});
      renderer.handleChunk({ messages: [] });

      // Only the header should NOT have been printed since nothing interesting happened
      expect(spinner.persisted.length).toBe(0);
    });

    test('ignores messages with empty tool_calls array', () => {
      const chunk = agentUpdateChunk({ content: '', tool_calls: [] });
      renderer.handleChunk(chunk);

      expect(spinner.persisted.length).toBe(0);
    });
  });

  // ── Tool call display formatting ────────────────────────

  describe('tool call formatting', () => {
    test('formats single string argument inline', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/heap/summary.json' } }]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('read_file(file_path: "/heap/summary.json")'))).toBe(
        true,
      );
    });

    test('formats zero-argument tool call', () => {
      const chunk = agentUpdateChunk(aiMessageWithToolCalls([{ name: 'list_todos', args: {} }]));
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('list_todos()'))).toBe(true);
    });

    test('formats multi-argument tool call with truncated values', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([
          {
            name: 'edit_file',
            args: {
              file_path: '/src/app.ts',
              old_string: 'console.log("debug")',
              new_string: 'logger.debug("info")',
            },
          },
        ]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      const editLine = texts.find((t) => t.includes('edit_file('));
      expect(editLine).toBeDefined();
      expect(editLine).toContain('file_path:');
      expect(editLine).toContain('old_string:');
      expect(editLine).toContain('new_string:');
    });

    test('truncates more than 3 arguments with ellipsis', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([
          {
            name: 'complex_tool',
            args: { a: '1', b: '2', c: '3', d: '4' },
          },
        ]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      const line = texts.find((t) => t.includes('complex_tool('));
      expect(line).toBeDefined();
      expect(line).toContain('...');
    });

    test('truncates very long string argument values', () => {
      const longPath = '/very/long/path/' + 'x'.repeat(100) + '/file.json';
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: longPath } }]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      const line = texts.find((t) => t.includes('read_file('));
      expect(line).toBeDefined();
      // The long value should be truncated (the formatted line should not contain the full path)
      expect(line!.length).toBeLessThan(longPath.length + 30);
    });

    test('formats numeric and boolean argument values', () => {
      const chunk = agentUpdateChunk(
        aiMessageWithToolCalls([
          { name: 'read_file', args: { file_path: '/a.ts', offset: 10, limit: 500 } },
        ]),
      );
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      const line = texts.find((t) => t.includes('read_file('));
      expect(line).toBeDefined();
      expect(line).toContain('offset: 10');
    });
  });

  // ── Tool call deduplication ─────────────────────────────

  describe('tool call deduplication', () => {
    test('does not repeat the same tool name back-to-back', () => {
      // Two consecutive read_file calls
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/b.json' } }]),
        ),
      );

      const texts = spinner.persistedTexts();
      const toolLines = texts.filter((t) => t.includes('read_file'));
      expect(toolLines.length).toBe(1);
    });

    test('shows different tool names consecutively', () => {
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'TODO' } }])),
      );

      const texts = spinner.persistedTexts();
      expect(texts.filter((t) => t.includes('read_file')).length).toBe(1);
      expect(texts.filter((t) => t.includes('grep')).length).toBe(1);
    });

    test('shows same tool name again after a different tool', () => {
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'error' } }])),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/c.json' } }]),
        ),
      );

      const texts = spinner.persistedTexts();
      const readLines = texts.filter((t) => t.includes('read_file'));
      expect(readLines.length).toBe(2);
    });

    test('resets deduplication when a todo transitions to in_progress', () => {
      // Tool call before todo
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      // Todo becomes in_progress → resets tracking
      renderer.handleChunk(
        todoChunk([{ id: '1', content: 'Analyze heap', status: 'in_progress' }]),
      );
      // Same tool name again — should be shown now
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/b.json' } }]),
        ),
      );

      const texts = spinner.persistedTexts();
      const readLines = texts.filter((t) => t.includes('read_file'));
      expect(readLines.length).toBe(2);
    });

    test('resets deduplication when a todo completes', () => {
      renderer.handleChunk(
        todoChunk([{ id: '1', content: 'Analyze heap', status: 'in_progress' }]),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      // Complete the todo → resets tracking
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Analyze heap', status: 'completed' }]));
      // Same tool again
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/b.json' } }]),
        ),
      );

      const texts = spinner.persistedTexts();
      const readLines = texts.filter((t) => t.includes('read_file'));
      expect(readLines.length).toBe(2);
    });
  });

  // ── Progress tracking ───────────────────────────────────

  describe('progress tracking', () => {
    test('shows [completed/total] prefix when todos complete', () => {
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Parse heap', status: 'in_progress' },
          { id: '2', content: 'Analyze network', status: 'pending' },
          { id: '3', content: 'Check runtime', status: 'pending' },
        ]),
      );
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Parse heap', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      const completedLine = texts.find((t) => t.includes('Parse heap') && t.includes('✓'));
      expect(completedLine).toBeDefined();
      expect(completedLine).toContain('[1/3]');
    });

    test('updates progress as more todos complete', () => {
      // All 3 start as pending
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Task A', status: 'pending' },
          { id: '2', content: 'Task B', status: 'pending' },
          { id: '3', content: 'Task C', status: 'pending' },
        ]),
      );
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'completed' }]));
      renderer.handleChunk(todoChunk([{ id: '2', content: 'Task B', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '2', content: 'Task B', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      const taskA = texts.find((t) => t.includes('Task A') && t.includes('✓'));
      const taskB = texts.find((t) => t.includes('Task B') && t.includes('✓'));
      expect(taskA).toContain('[1/3]');
      expect(taskB).toContain('[2/3]');
    });

    test('excludes cancelled todos from total count', () => {
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Task A', status: 'pending' },
          { id: '2', content: 'Task B', status: 'pending' },
          { id: '3', content: 'Task C', status: 'cancelled' },
        ]),
      );
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      const completed = texts.find((t) => t.includes('Task A') && t.includes('✓'));
      expect(completed).toBeDefined();
      // Total should be 2 (cancelled is excluded)
      expect(completed).toContain('[1/2]');
    });

    test('includes progress prefix in spinner text during in_progress', () => {
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Task A', status: 'in_progress' },
          { id: '2', content: 'Task B', status: 'pending' },
        ]),
      );
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'completed' }]));
      renderer.handleChunk(todoChunk([{ id: '2', content: 'Task B', status: 'in_progress' }]));

      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).toContain('[1/2]');
      expect(spinnerText).toContain('Task B');
    });

    test('does not show progress prefix before any todos exist', () => {
      // Only a tool call, no todos yet
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );

      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).not.toMatch(/\[\d+\/\d+\]/);
    });
  });

  // ── Todo handling (existing behavior) ───────────────────

  describe('todo handling', () => {
    test('prints header on first todo change', () => {
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Analyze', status: 'in_progress' }]));

      const texts = spinner.persistedTexts();
      expect(texts[0]).toBe('Performance analysis progress:');
    });

    test('only prints header once', () => {
      renderer.handleChunk(todoChunk([{ id: '1', content: 'A', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'A', status: 'completed' }]));
      renderer.handleChunk(todoChunk([{ id: '2', content: 'B', status: 'in_progress' }]));

      const texts = spinner.persistedTexts();
      const headers = texts.filter((t) => t === 'Performance analysis progress:');
      expect(headers.length).toBe(1);
    });

    test('marks completed todos with green checkmark', () => {
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('✓') && t.includes('Task A'))).toBe(true);
    });

    test('updates spinner text when todo becomes in_progress', () => {
      renderer.handleChunk(
        todoChunk([{ id: '1', content: 'Working on X', status: 'in_progress' }]),
      );

      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).toContain('Working on X');
    });

    test('ignores duplicate status updates for the same todo', () => {
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'in_progress' }]));
      const countAfterFirst = spinner.persisted.length;

      renderer.handleChunk(todoChunk([{ id: '1', content: 'Task A', status: 'in_progress' }]));
      expect(spinner.persisted.length).toBe(countAfterFirst);
    });

    test('uses todo content as key when id is missing', () => {
      renderer.handleChunk(todoChunk([{ content: 'Unique task name', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ content: 'Unique task name', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('✓') && t.includes('Unique task name'))).toBe(true);
    });

    test('extracts todos from nested updates-mode chunk', () => {
      // Updates mode: { agent: { todos: [...] } }
      renderer.handleChunk({
        agent: { todos: [{ id: '1', content: 'From agent', status: 'in_progress' }] },
      });

      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).toContain('From agent');
    });
  });

  // ── Combined flow ───────────────────────────────────────

  describe('combined todo + tool call flow', () => {
    test('interleaves tool calls and todo updates correctly', () => {
      // 1. Todo starts
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Analyze heap snapshot', status: 'in_progress' },
          { id: '2', content: 'Review network waterfall', status: 'pending' },
        ]),
      );

      // 2. Tool call while analyzing heap
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            { name: 'read_file', args: { file_path: '/heap/summary.json' } },
          ]),
        ),
      );

      // 3. Another tool call
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'detached', path: '/heap' } }]),
        ),
      );

      // 4. First todo completes
      renderer.handleChunk(
        todoChunk([{ id: '1', content: 'Analyze heap snapshot', status: 'completed' }]),
      );

      // 5. Second todo starts
      renderer.handleChunk(
        todoChunk([{ id: '2', content: 'Review network waterfall', status: 'in_progress' }]),
      );

      // 6. Tool call for second todo
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            { name: 'read_file', args: { file_path: '/trace/network-waterfall.json' } },
          ]),
        ),
      );

      const texts = spinner.persistedTexts();

      // Header was printed
      expect(texts[0]).toBe('Performance analysis progress:');

      // Tool calls were printed
      expect(texts.some((t) => t.includes('read_file') && t.includes('summary.json'))).toBe(true);
      expect(texts.some((t) => t.includes('grep') && t.includes('detached'))).toBe(true);

      // Completed todo has progress prefix
      const heapCompleted = texts.find(
        (t) => t.includes('Analyze heap snapshot') && t.includes('✓'),
      );
      expect(heapCompleted).toBeDefined();
      expect(heapCompleted).toContain('[1/2]');

      // Second tool call (read_file) appears again after todo reset
      const readFileLines = texts.filter((t) => t.includes('read_file'));
      expect(readFileLines.length).toBe(2);

      // Spinner shows second todo
      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).toContain('Review network waterfall');
    });

    test('tool calls between todo transitions are all captured', () => {
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Step 1', status: 'in_progress' },
          { id: '2', content: 'Step 2', status: 'pending' },
          { id: '3', content: 'Step 3', status: 'pending' },
        ]),
      );

      // Multiple different tool calls
      const tools = ['read_file', 'glob', 'grep', 'ls'];
      for (const name of tools) {
        renderer.handleChunk(
          agentUpdateChunk(aiMessageWithToolCalls([{ name, args: { path: '/src' } }])),
        );
      }

      const texts = spinner.persistedTexts();
      for (const name of tools) {
        expect(texts.some((t) => t.includes(name))).toBe(true);
      }
    });
  });

  // ── Edge cases ──────────────────────────────────────────

  describe('edge cases', () => {
    test('handles chunk with both tool calls and todos in same message', () => {
      // An updates chunk that has both messages (with tool_calls) and todos
      const chunk = {
        agent: {
          messages: [
            aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/data.json' } }]),
          ],
          todos: [{ id: '1', content: 'Reading data', status: 'in_progress' }],
        },
      };
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      // Should have header + tool call line
      expect(texts.some((t) => t.includes('read_file'))).toBe(true);
      // Spinner should mention the todo
      expect(stripAnsi(spinner.text)).toContain('Reading data');
    });

    test('handles tool call with undefined args gracefully', () => {
      const chunk = agentUpdateChunk({
        content: '',
        tool_calls: [{ id: 'call_1', name: 'some_tool' }],
      });
      renderer.handleChunk(chunk);

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('some_tool()'))).toBe(true);
    });

    test('handles tool call with null name gracefully (skipped)', () => {
      const chunk = agentUpdateChunk({
        content: '',
        tool_calls: [{ id: 'call_1', name: '', args: {} }],
      });
      renderer.handleChunk(chunk);

      // Empty name is falsy — should be skipped
      const texts = spinner.persistedTexts();
      expect(texts.length).toBe(0);
    });

    test('preserves base spinner text in updates', () => {
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Task A', status: 'in_progress' },
          { id: '2', content: 'Task B', status: 'pending' },
        ]),
      );

      const spinnerText = stripAnsi(spinner.text);
      expect(spinnerText).toContain('Analyzing...');
      expect(spinnerText).toContain('Task A');
    });

    test('handles rapid todo state changes correctly', () => {
      // pending → in_progress → completed all at once
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Fast task', status: 'pending' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Fast task', status: 'in_progress' }]));
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Fast task', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      // Should show the completed line
      expect(texts.some((t) => t.includes('✓') && t.includes('Fast task'))).toBe(true);
    });
  });

  // ── Subagent tool calls ──────────────────────────────────

  describe('subagent tool calls', () => {
    test('renders subagent tool calls with [subagent] label and extra indentation', () => {
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      // Subagent chunk — same tool name but should NOT be deduped
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/sub/b.json' } }]),
        ),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      // Main agent line (no [subagent] label)
      const mainLine = texts.find((t) => t.includes('read_file') && !t.includes('[subagent]'));
      expect(mainLine).toBeDefined();
      // Subagent line (has [subagent] label)
      const subLine = texts.find((t) => t.includes('[subagent]') && t.includes('read_file'));
      expect(subLine).toBeDefined();
      expect(subLine).toContain('/sub/b.json');
    });

    test('deduplicates subagent tool calls independently from main agent', () => {
      // Main agent calls read_file
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.json' } }]),
        ),
      );
      // Subagent calls read_file twice in a row — second should be deduped
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/x.json' } }]),
        ),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/y.json' } }]),
        ),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLines = texts.filter((t) => t.includes('[subagent]'));
      // Only 1 subagent line because second read_file was deduped
      expect(subLines.length).toBe(1);
    });

    test('subagent chunks do not affect main agent todo tracking', () => {
      // Set up main agent todos
      renderer.handleChunk(
        todoChunk([
          { id: '1', content: 'Main task', status: 'in_progress' },
          { id: '2', content: 'Second task', status: 'pending' },
        ]),
      );

      // Subagent chunk with todos field — should be ignored
      renderer.handleChunk(
        { agent: { todos: [{ id: 'sub-1', content: 'Sub task', status: 'in_progress' }] } },
        { isSubagent: true },
      );

      // Main task completes
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Main task', status: 'completed' }]));

      const texts = spinner.persistedTexts();
      // Only main todo should have progress prefix [1/2]
      const mainCompleted = texts.find((t) => t.includes('Main task') && t.includes('✓'));
      expect(mainCompleted).toBeDefined();
      expect(mainCompleted).toContain('[1/2]');
      // Sub task should NOT appear as a completed line
      expect(texts.some((t) => t.includes('Sub task') && t.includes('✓'))).toBe(false);
    });

    test('resets both main and subagent dedup on todo transition', () => {
      // Subagent calls read_file
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/sub/a.json' } }]),
        ),
        { isSubagent: true },
      );

      // Todo transition resets all tracking
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Step 1', status: 'in_progress' }]));

      // Same tool name again — should be shown (dedup was reset)
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/sub/b.json' } }]),
        ),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLines = texts.filter((t) => t.includes('[subagent]'));
      expect(subLines.length).toBe(2);
    });

    test('shows different subagent tool names consecutively', () => {
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/x.ts' } }]),
        ),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'TODO' } }])),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'glob', args: { pattern: '*.ts' } }])),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLines = texts.filter((t) => t.includes('[subagent]'));
      expect(subLines.length).toBe(3);
      expect(subLines.some((t) => t.includes('read_file'))).toBe(true);
      expect(subLines.some((t) => t.includes('grep'))).toBe(true);
      expect(subLines.some((t) => t.includes('glob'))).toBe(true);
    });

    test('interleaves main agent task tool with subagent file reads', () => {
      // Simulates: main agent calls task() → subagent runs read_file/grep → returns
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Read source', status: 'in_progress' }]));

      // Main agent calls task tool to spawn subagent
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            {
              name: 'task',
              args: { subagent_type: 'general-purpose', description: 'Read runner.ts' },
            },
          ]),
        ),
      );

      // Subagent reads files
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/src/runner.ts' } }]),
        ),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            { name: 'read_file', args: { file_path: '/src/runner.ts', offset: 100, limit: 80 } },
          ]),
        ),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'async', path: '/src' } }]),
        ),
        { isSubagent: true },
      );

      // Main agent continues after subagent completes
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Read source', status: 'completed' }]));

      const texts = spinner.persistedTexts();

      // Main agent tool call (task) — not labelled as subagent
      expect(texts.some((t) => t.includes('task(') && !t.includes('[general-purpose]'))).toBe(true);

      // Subagent tool calls — labelled [general-purpose] from the task() args
      const subLines = texts.filter((t) => t.includes('[general-purpose]'));
      expect(subLines.some((t) => t.includes('read_file'))).toBe(true);
      expect(subLines.some((t) => t.includes('grep'))).toBe(true);

      // Todo completed with progress
      expect(texts.some((t) => t.includes('✓') && t.includes('Read source'))).toBe(true);
    });

    test('captures subagent_type from task() tool call and uses it as the label', () => {
      // Main agent calls task(subagent_type: "cpu-hotspot", ...)
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            {
              name: 'task',
              args: { subagent_type: 'cpu-hotspot', description: 'Analyze hot functions' },
            },
          ]),
        ),
      );
      // Subagent chunk arrives — should be labelled [cpu-hotspot]
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/src/data.ts' } }]),
        ),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLine = texts.find((t) => t.includes('[cpu-hotspot]'));
      expect(subLine).toBeDefined();
      expect(subLine).toContain('read_file');
    });

    test('falls back to [subagent] when no prior task() call provides a name', () => {
      // Subagent chunk without any preceding task() call
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'TODO' } }])),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLine = texts.find((t) => t.includes('[subagent]'));
      expect(subLine).toBeDefined();
      expect(subLine).toContain('grep');
    });

    test('persists subagent name across multiple subagent chunks', () => {
      // Main agent spawns "listener-leak" subagent
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            {
              name: 'task',
              args: { subagent_type: 'listener-leak', description: 'Check listeners' },
            },
          ]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.ts' } }]),
        ),
        { isSubagent: true },
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'addEventListener' } }]),
        ),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      const subLines = texts.filter((t) => t.includes('[listener-leak]'));
      expect(subLines.length).toBe(2);
    });

    test('updates label when main agent spawns a different subagent', () => {
      // First subagent: cpu-hotspot
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            { name: 'task', args: { subagent_type: 'cpu-hotspot', description: 'CPU analysis' } },
          ]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.ts' } }]),
        ),
        { isSubagent: true },
      );

      // Second subagent: memory-closure
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            {
              name: 'task',
              args: { subagent_type: 'memory-closure', description: 'Memory analysis' },
            },
          ]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'WeakRef' } }])),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      expect(texts.some((t) => t.includes('[cpu-hotspot]') && t.includes('read_file'))).toBe(true);
      expect(texts.some((t) => t.includes('[memory-closure]') && t.includes('grep'))).toBe(true);
    });

    test('resets subagent name on todo transition', () => {
      // Main agent spawns cpu-hotspot
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([
            { name: 'task', args: { subagent_type: 'cpu-hotspot', description: 'CPU analysis' } },
          ]),
        ),
      );
      renderer.handleChunk(
        agentUpdateChunk(
          aiMessageWithToolCalls([{ name: 'read_file', args: { file_path: '/a.ts' } }]),
        ),
        { isSubagent: true },
      );

      // Todo transition resets dedup tracking
      renderer.handleChunk(todoChunk([{ id: '1', content: 'Step 1', status: 'in_progress' }]));

      // New subagent chunk after reset: dispatched subagent list persists,
      // so the label still shows the last dispatched name (cpu-hotspot)
      renderer.handleChunk(
        agentUpdateChunk(aiMessageWithToolCalls([{ name: 'grep', args: { pattern: 'TODO' } }])),
        { isSubagent: true },
      );

      const texts = spinner.persistedTexts();
      // Both the pre-reset and post-reset chunks should show [cpu-hotspot]
      // because the dispatched subagent list is preserved (subagents are still running)
      const cpuHotspotLabels = texts.filter((t) => t.includes('[cpu-hotspot]'));
      expect(cpuHotspotLabels.length).toBe(2);
    });
  });

  // ── Integration with analyzeTestPerformance ─────────────

  describe('integration with analyzeTestPerformance + FakeToolCallingModel', () => {
    test('captures tool calls, todos, and progress from a real agent stream', async () => {
      // 1. Set up a temp workspace that looks like a Vitest analysis workspace
      const workDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-progress-int-'));

      try {
        // Create workspace directories and files the model will read
        mkdirSync(join(workDir, 'hot-functions'), { recursive: true });
        mkdirSync(join(workDir, 'scripts'), { recursive: true });
        mkdirSync(join(workDir, 'src'), { recursive: true });

        writeFileSync(
          join(workDir, 'hot-functions', 'application.json'),
          JSON.stringify([
            {
              functionName: 'processRecords',
              scriptUrl: '/src/data.ts',
              lineNumber: 42,
              selfTime: 320,
              selfPercent: 18.5,
              sourceCategory: 'application',
            },
          ]),
        );

        writeFileSync(
          join(workDir, 'src', 'data.ts'),
          [
            'export function processRecords(records: any[]) {',
            '  const result = [];',
            '  for (const r of records) {',
            '    result.push(JSON.parse(JSON.stringify(r)));',
            '  }',
            '  return result;',
            '}',
          ].join('\n'),
        );

        writeFileSync(
          join(workDir, 'summary.json'),
          JSON.stringify({
            totalTests: 12,
            totalDuration: 4500,
            slowestFile: 'data.test.ts',
          }),
        );

        const backend = new FilesystemBackend({ rootDir: workDir });

        // 2. Build the fake model with a multi-step message sequence.
        //    The builder receives the bound tool names so it can call the
        //    structured-output tool by its dynamic name on the final step.
        const model = new FakeToolCallingModel((boundToolNames) => {
          // The structured-output tool is the one starting with "extract-"
          const structTool = boundToolNames.find((n) => n.startsWith('extract-')) ?? 'extract-1';

          return [
            // Step 1: Create an analysis plan via write_todos
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_010',
                  name: 'write_todos',
                  args: {
                    todos: [
                      { content: 'Review hot functions', status: 'in_progress' },
                      { content: 'Read source code for root causes', status: 'pending' },
                      { content: 'Produce findings', status: 'pending' },
                    ],
                  },
                },
              ],
            }),
            // Step 2: Read the hot functions file
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_020',
                  name: 'read_file',
                  args: { file_path: '/hot-functions/application.json' },
                },
              ],
            }),
            // Step 3: Read the source file
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_030',
                  name: 'read_file',
                  args: { file_path: '/src/data.ts' },
                },
              ],
            }),
            // Step 4: Search for the pattern
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_040',
                  name: 'grep',
                  args: { pattern: 'JSON.parse', path: '/src' },
                },
              ],
            }),
            // Step 5: Mark first task done, start second, then third
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_050',
                  name: 'write_todos',
                  args: {
                    todos: [
                      { content: 'Review hot functions', status: 'completed' },
                      { content: 'Read source code for root causes', status: 'completed' },
                      { content: 'Produce findings', status: 'in_progress' },
                    ],
                  },
                },
              ],
            }),
            // Step 6: Submit structured findings (terminates the agent loop)
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'call_060',
                  name: structTool,
                  args: {
                    findings: [
                      {
                        severity: 'warning',
                        title: 'Deep-clone via JSON round-trip in processRecords',
                        description:
                          'processRecords() uses JSON.parse(JSON.stringify(r)) to clone each record, which is O(n) serialization per item.',
                        category: 'hot-function',
                        sourceFile: '/src/data.ts',
                        lineNumber: 4,
                        impactMs: 320,
                        suggestedFix: 'Use structuredClone(r) or a shallow spread instead.',
                        hotFunction: {
                          name: 'processRecords',
                          scriptUrl: '/src/data.ts',
                          lineNumber: 42,
                          selfTime: 320,
                          selfPercent: 18.5,
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          ];
        });

        // 3. Use a MockSpinner so we can inspect the output
        const testSpinner = createMockSpinner('zeitzeuge: Analyzing...');

        // 4. Run the full analyzeTestPerformance pipeline
        const findings = await analyzeTestPerformance(
          model as any,
          backend,
          testSpinner as unknown as Ora,
        );

        // 5. Verify findings were returned correctly
        expect(findings).toBeArrayOfSize(1);
        expect(findings[0]!.title).toContain('processRecords');
        expect(findings[0]!.severity).toBe('warning');

        // 6. Verify the renderer captured tool calls
        const texts = testSpinner.persistedTexts();

        // Header should be printed
        expect(texts[0]).toBe('Performance analysis progress:');

        // Tool calls should appear in the output
        expect(texts.some((t) => t.includes('read_file'))).toBe(true);
        expect(texts.some((t) => t.includes('application.json'))).toBe(true);
        expect(texts.some((t) => t.includes('grep'))).toBe(true);
        expect(texts.some((t) => t.includes('JSON.parse'))).toBe(true);

        // 7. Verify todo progress was tracked
        const completedLines = texts.filter((t) => t.includes('✓'));
        expect(completedLines.length).toBeGreaterThanOrEqual(2);

        // Progress prefix should appear in completed lines
        expect(completedLines.some((t) => /\[\d+\/\d+\]/.test(t))).toBe(true);

        // write_todos calls should appear
        expect(texts.some((t) => t.includes('write_todos'))).toBe(true);
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    }, 30_000);

    test('renders subagent tool calls from a DeepAgent with 2 FakeToolCallingModels', async () => {
      const workDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-subagent-int-'));

      try {
        mkdirSync(join(workDir, 'hot-functions'), { recursive: true });
        mkdirSync(join(workDir, 'src'), { recursive: true });

        writeFileSync(
          join(workDir, 'hot-functions', 'application.json'),
          JSON.stringify([
            {
              functionName: 'processRecords',
              scriptUrl: '/src/data.ts',
              lineNumber: 42,
              selfTime: 320,
              selfPercent: 18.5,
              sourceCategory: 'application',
            },
          ]),
        );

        writeFileSync(
          join(workDir, 'src', 'data.ts'),
          [
            'export function processRecords(records: any[]) {',
            '  const result = [];',
            '  for (const r of records) {',
            '    result.push(JSON.parse(JSON.stringify(r)));',
            '  }',
            '  return result;',
            '}',
          ].join('\n'),
        );

        const backend = new FilesystemBackend({ rootDir: workDir });

        // ── Subagent model: reads source files and returns ──
        const subagentModel = new FakeToolCallingModel([
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'sub_01',
                name: 'read_file',
                args: { file_path: '/src/data.ts' },
              },
            ],
          }),
          new AIMessage({
            content: '',
            tool_calls: [
              {
                id: 'sub_02',
                name: 'grep',
                args: { pattern: 'JSON.parse', path: '/src' },
              },
            ],
          }),
          // No tool_calls → terminates subagent
          new AIMessage({
            content:
              'Found: processRecords at line 4 uses JSON.parse(JSON.stringify(r)) for deep cloning.',
          }),
        ]);

        // ── Main agent model: creates plan, spawns subagent, returns findings ──
        const mainModel = new FakeToolCallingModel((boundToolNames) => {
          const structTool = boundToolNames.find((n) => n.startsWith('extract-')) ?? 'extract-1';

          return [
            // Step 1: Plan
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'main_01',
                  name: 'write_todos',
                  args: {
                    todos: [
                      { content: 'Review hot functions', status: 'in_progress' },
                      { content: 'Verify in source code', status: 'pending' },
                      { content: 'Produce findings', status: 'pending' },
                    ],
                  },
                },
              ],
            }),
            // Step 2: Read hot functions
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'main_02',
                  name: 'read_file',
                  args: { file_path: '/hot-functions/application.json' },
                },
              ],
            }),
            // Step 3: Spawn subagent to read source
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'main_03',
                  name: 'task',
                  args: {
                    subagent_type: 'source-reader',
                    description: 'Read /src/data.ts and verify the processRecords bottleneck',
                  },
                },
              ],
            }),
            // Step 4: Mark progress after subagent returns
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'main_04',
                  name: 'write_todos',
                  args: {
                    todos: [
                      { content: 'Review hot functions', status: 'completed' },
                      { content: 'Verify in source code', status: 'completed' },
                      { content: 'Produce findings', status: 'in_progress' },
                    ],
                  },
                },
              ],
            }),
            // Step 5: Submit findings
            new AIMessage({
              content: '',
              tool_calls: [
                {
                  id: 'main_05',
                  name: structTool,
                  args: {
                    findings: [
                      {
                        severity: 'warning',
                        title: 'Deep-clone via JSON round-trip in processRecords',
                        description:
                          'processRecords() uses JSON.parse(JSON.stringify(r)) per item.',
                        category: 'hot-function',
                        sourceFile: '/src/data.ts',
                        lineNumber: 4,
                        impactMs: 320,
                        suggestedFix: 'Use structuredClone(r) instead.',
                        hotFunction: {
                          name: 'processRecords',
                          scriptUrl: '/src/data.ts',
                          lineNumber: 42,
                          selfTime: 320,
                          selfPercent: 18.5,
                        },
                      },
                    ],
                  },
                },
              ],
            }),
          ];
        });

        // ── Define the custom subagent ──
        const sourceReader: SubAgent = {
          name: 'source-reader',
          description: 'Reads source code files to verify performance bottlenecks',
          systemPrompt: 'You are a source code reader. Read files and report your findings.',
          model: subagentModel as any,
        };

        // ── Create the agent with subagent support ──
        const agent = createDeepAgent({
          model: mainModel as any,
          backend,
          subagents: [sourceReader],
          responseFormat: toolStrategy(FindingsSchema),
        });

        // ── Stream with subgraphs: true and feed to renderer ──
        const testSpinner = createMockSpinner('zeitzeuge: Analyzing...');
        const testRenderer = new TodoProgressRenderer(testSpinner as unknown as Ora);

        const stream = await agent.stream(
          { messages: [{ role: 'user', content: 'Analyze the test performance.' }] } as any,
          { streamMode: ['updates', 'values'], subgraphs: true } as any,
        );

        let lastValues: unknown;
        for await (const item of stream as AsyncIterable<unknown>) {
          if (!Array.isArray(item)) {
            testRenderer.handleChunk(item);
            lastValues = item;
            continue;
          }

          if (item.length === 3) {
            const [ns, mode, chunk] = item;
            const isSubagent =
              typeof ns === 'string'
                ? ns.includes('tools:')
                : Array.isArray(ns) && ns.some((s: string) => s.includes('tools:'));
            testRenderer.handleChunk(chunk, { isSubagent });
            if (!isSubagent && mode === 'values') lastValues = chunk;
          } else if (item.length === 2) {
            const [mode, chunk] = item;
            testRenderer.handleChunk(chunk);
            if (mode === 'values') lastValues = chunk;
          }
        }

        // ── Assertions ──
        const texts = testSpinner.persistedTexts();

        // Header
        expect(texts[0]).toBe('Performance analysis progress:');

        // Main agent tool calls (no subagent label)
        expect(
          texts.some(
            (t) =>
              t.includes('read_file') &&
              !t.includes('[source-reader]') &&
              !t.includes('[subagent]'),
          ),
        ).toBe(true);
        expect(
          texts.some(
            (t) =>
              t.includes('task(') && !t.includes('[source-reader]') && !t.includes('[subagent]'),
          ),
        ).toBe(true);

        // Subagent tool calls should appear with [source-reader] label
        // (captured from the main agent's task(subagent_type: "source-reader") call)
        const subLines = texts.filter((t) => t.includes('[source-reader]'));
        expect(subLines.length).toBeGreaterThanOrEqual(1);
        // Subagent should have called read_file and/or grep
        expect(subLines.some((t) => t.includes('read_file') || t.includes('grep'))).toBe(true);

        // Todo progress
        const completedLines = texts.filter((t) => t.includes('✓'));
        expect(completedLines.length).toBeGreaterThanOrEqual(2);

        // Agent ran to completion
        expect(lastValues).toBeDefined();
      } finally {
        rmSync(workDir, { recursive: true, force: true });
      }
    }, 30_000);
  });
});
