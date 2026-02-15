import pc from 'picocolors';
import type { Ora } from 'ora';

type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | (string & {});

type AgentTodo = {
  content: string;
  status: TodoStatus;
  id?: string;
};

/** Minimal representation of a tool call extracted from a stream chunk. */
interface ToolCallInfo {
  name: string;
  args: Record<string, unknown>;
}

/** Options passed alongside a chunk to provide context about its origin. */
export interface ChunkMeta {
  /** True when the chunk originates from a subagent (subgraph). */
  isSubagent?: boolean;
}

export class TodoProgressRenderer {
  private lastStatusByKey = new Map<string, string>();
  private lastInProgressKey: string | undefined;
  private baseSpinnerText: string | undefined;
  private printedHeader = false;
  /** Last tool call name for the main agent (dedup). */
  private lastToolCallName: string | undefined;
  /** Last tool call name for subagents (separate dedup). */
  private lastSubagentToolCallName: string | undefined;
  private currentInProgressContent: string | undefined;
  private totalTodos = 0;
  private completedTodos = 0;

  /**
   * Whether the spinner supports in-place animation.
   *
   * When false (CI / Bun), we avoid calling `spinner.start()` after
   * `stopAndPersist()` because ora's non-animated `start()` writes a
   * full text line — producing duplicate/garbled output.
   */
  private canAnimate: boolean;

  constructor(
    private spinner: Ora,
    { animate = true }: { animate?: boolean } = {},
  ) {
    this.baseSpinnerText = spinner.text;
    this.canAnimate = animate;
  }

  private printHeaderOnce(): void {
    if (this.printedHeader) return;
    this.printedHeader = true;

    const header = 'Performance analysis progress:';
    this.spinner.stopAndPersist({ symbol: ' ', text: header });
    // Only restart animation when the spinner supports it.
    // When isEnabled is false (CI / Bun), start() writes a duplicate
    // text line instead of animating, which produces noisy output.
    if (this.canAnimate) this.spinner.start();
  }

  /** Build a progress prefix like `[2/5]` from the current todo counts. */
  private progressPrefix(): string {
    if (this.totalTodos === 0) return '';
    return pc.dim(`[${this.completedTodos}/${this.totalTodos}]`) + ' ';
  }

  /** Recompute todo counts from the full status map. */
  private recomputeCounts(): void {
    let total = 0;
    let completed = 0;
    for (const status of this.lastStatusByKey.values()) {
      if (status !== 'cancelled') total++;
      if (status === 'completed') completed++;
    }
    this.totalTodos = total;
    this.completedTodos = completed;
  }

  /** Update the spinner text with current progress & context. */
  private updateSpinnerText(contextLabel?: string): void {
    const prefix = this.progressPrefix();
    const base = this.baseSpinnerText ?? '';
    const ctx = contextLabel ? ` (${contextLabel})` : '';
    this.spinner.text = `${prefix}${base}${ctx}`;
  }

  handleChunk(chunk: unknown, meta?: ChunkMeta): void {
    const isSubagent = meta?.isSubagent === true;

    // --- Handle tool calls ---
    const toolCalls = extractToolCallsFromStreamChunk(chunk);
    if (toolCalls && toolCalls.length > 0) {
      for (const tc of toolCalls) {
        const signature = formatToolCall(tc);

        // Main agent and subagent have independent dedup tracking
        const lastName = isSubagent ? this.lastSubagentToolCallName : this.lastToolCallName;
        if (tc.name !== lastName) {
          if (isSubagent) this.lastSubagentToolCallName = tc.name;
          else this.lastToolCallName = tc.name;

          this.printHeaderOnce();

          // Subagent tool calls get extra indentation + label
          const label = isSubagent
            ? `      ↳ ${pc.cyan('[subagent]')} ${signature}`
            : `  ↳ ${signature}`;
          this.spinner.stopAndPersist({
            symbol: ' ',
            text: pc.dim(label),
          });
          if (this.canAnimate) {
            this.spinner.start();
            this.updateSpinnerText(this.currentInProgressContent);
          }
        }
      }
    }

    // Subagent chunks don't carry the main agent's todo state — skip todos.
    if (isSubagent) return;

    // --- Handle todos ---
    const todos = extractTodosFromStreamChunk(chunk);
    if (!todos) return;

    for (const todo of todos) {
      const key = (todo.id && String(todo.id)) || todo.content;
      const prevStatus = this.lastStatusByKey.get(key);
      const nextStatus = todo.status;

      if (prevStatus !== nextStatus) {
        this.lastStatusByKey.set(key, nextStatus);
        this.recomputeCounts();

        if (nextStatus === 'completed' && prevStatus !== 'completed') {
          this.printHeaderOnce();
          this.spinner.stopAndPersist({
            symbol: ' ',
            text: `  ${this.progressPrefix()}${pc.green('✓')} ${todo.content}`,
          });
          if (this.canAnimate) this.spinner.start();
          // Reset tool call tracking when moving to a new todo
          this.lastToolCallName = undefined;
          this.lastSubagentToolCallName = undefined;
        }

        if (nextStatus === 'in_progress' && this.lastInProgressKey !== key) {
          this.lastInProgressKey = key;
          this.currentInProgressContent = todo.content;
          this.printHeaderOnce();
          if (this.canAnimate) {
            this.updateSpinnerText(todo.content);
          }
          // Reset tool call tracking for the new task
          this.lastToolCallName = undefined;
          this.lastSubagentToolCallName = undefined;
        }
      }
    }
  }
}

// ── Extraction helpers ──────────────────────────────────────────

/**
 * Extract todos from a stream chunk.
 * @param chunk - The chunk to extract todos from.
 * @returns The todos from the chunk.
 */
function extractTodosFromStreamChunk(chunk: unknown): AgentTodo[] | undefined {
  if (!chunk || typeof chunk !== 'object') return;

  const direct = chunk as { todos?: unknown };
  if (Array.isArray(direct.todos)) return direct.todos as AgentTodo[];

  // streamMode: "updates" yields objects like { nodeName: { ...update } }
  for (const value of Object.values(chunk as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const nested = value as { todos?: unknown };
    if (Array.isArray(nested.todos)) return nested.todos as AgentTodo[];
  }
}

/**
 * Extract tool calls from a stream chunk.
 *
 * LangGraph "updates" mode yields objects like:
 *   { nodeName: { messages: [ AIMessage { tool_calls: [...] } ] } }
 *
 * LangGraph "values" mode yields the full state:
 *   { messages: [ ..., AIMessage { tool_calls: [...] } ] }
 */
function extractToolCallsFromStreamChunk(chunk: unknown): ToolCallInfo[] | undefined {
  if (!chunk || typeof chunk !== 'object') return;

  const results: ToolCallInfo[] = [];

  // Helper: pull tool_calls from a single message-like object
  const extractFromMessage = (msg: unknown): void => {
    if (!msg || typeof msg !== 'object') return;
    const m = msg as {
      tool_calls?: Array<{ name: string; args?: Record<string, unknown> }>;
      _getType?: () => string;
      getType?: () => string;
    };
    // LangChain message objects have _getType() or getType(), or we can duck-type
    if (!Array.isArray(m.tool_calls) || m.tool_calls.length === 0) return;
    for (const tc of m.tool_calls) {
      if (tc.name) {
        results.push({ name: tc.name, args: tc.args ?? {} });
      }
    }
  };

  // Helper: pull tool_calls from a messages array
  const extractFromMessages = (messages: unknown): void => {
    if (!Array.isArray(messages)) return;
    // Only look at the last message to avoid replaying old tool calls
    const last = messages[messages.length - 1];
    extractFromMessage(last);
  };

  // Direct: { messages: [...] }
  const direct = chunk as { messages?: unknown };
  if (Array.isArray(direct.messages)) {
    extractFromMessages(direct.messages);
    if (results.length > 0) return results;
  }

  // Nested (updates mode): { nodeName: { messages: [...] } }
  for (const value of Object.values(chunk as Record<string, unknown>)) {
    if (!value || typeof value !== 'object') continue;
    const nested = value as { messages?: unknown };
    if (Array.isArray(nested.messages)) {
      extractFromMessages(nested.messages);
      if (results.length > 0) return results;
    }
  }

  return results.length > 0 ? results : undefined;
}

/**
 * Format a tool call for display. Shows the tool name and a compact
 * summary of its arguments (truncated to keep output readable).
 */
function formatToolCall(tc: ToolCallInfo): string {
  const args = tc.args;
  const keys = Object.keys(args);

  if (keys.length === 0) return `${tc.name}()`;

  // For single-arg calls with a short string value, show it inline
  if (keys.length === 1) {
    const key = keys[0]!;
    const val = args[key];
    if (typeof val === 'string' && val.length <= 80) {
      return `${tc.name}(${key}: ${JSON.stringify(val)})`;
    }
  }

  // For multi-arg or complex calls, show key names + truncated values
  const parts: string[] = [];
  for (const key of keys.slice(0, 3)) {
    const val = args[key];
    parts.push(`${key}: ${truncateValue(val)}`);
  }
  if (keys.length > 3) parts.push('...');
  return `${tc.name}(${parts.join(', ')})`;
}

/** Truncate a value for display. */
function truncateValue(val: unknown, maxLen = 40): string {
  if (typeof val === 'string') {
    return val.length > maxLen
      ? JSON.stringify(val.slice(0, maxLen - 3) + '...')
      : JSON.stringify(val);
  }
  if (typeof val === 'number' || typeof val === 'boolean') return String(val);
  const json = JSON.stringify(val);
  if (json && json.length > maxLen) return json.slice(0, maxLen - 3) + '...';
  return json ?? 'undefined';
}
