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
  /** The LangGraph namespace for subgraph identification. */
  namespace?: unknown;
}

export class TodoProgressRenderer {
  private lastStatusByKey = new Map<string, string>();
  private lastInProgressKey: string | undefined;
  private baseSpinnerText: string | undefined;
  private printedHeader = false;
  /** Last consecutive dedup key for main-agent non-task tool calls. */
  private lastMainToolKey: string | undefined;
  /** Set of dispatched task keys (prevents re-printing across stream modes). */
  private seenTaskKeys = new Set<string>();
  /** Last tool call dedup key per subagent namespace. */
  private lastSubagentToolCallKeys = new Map<string, string>();
  /** Dispatched subagent names in order (from task tool calls). */
  private dispatchedSubagents: string[] = [];
  /** Maps namespace key → subagent name (learned from AIMessage `name` field). */
  private namespaceToSubagentName = new Map<string, string>();
  private currentInProgressContent: string | undefined;
  private totalTodos = 0;
  private completedTodos = 0;

  /** Per-subagent todo state: nsKey → Map<todoContent, status>. */
  private subagentTodos = new Map<string, Map<string, string>>();
  /**
   * Subagent types with auto-synthesized progress entries, pending completion.
   * Used when the LLM doesn't call `write_todos` — we auto-create a single
   * progress entry per dispatched task and auto-complete them when the main
   * agent resumes (indicating all subagents finished).
   */
  private pendingAutoTasks = new Set<string>();

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

  /** Persist a line and optionally restart the spinner. */
  private persistLine(symbol: string, text: string): void {
    this.spinner.stopAndPersist({ symbol, text });
    if (this.canAnimate) {
      this.spinner.start();
      this.updateSpinnerText(this.currentInProgressContent);
    }
  }

  /** Resolve the display name for a subagent from its namespace. */
  private resolveSubagentName(nsKey: string, namespace?: unknown): string {
    return (
      this.namespaceToSubagentName.get(nsKey) ??
      extractSubagentNameFromNamespace(namespace, this.dispatchedSubagents) ??
      this.dispatchedSubagents[this.dispatchedSubagents.length - 1] ??
      'subagent'
    );
  }

  /**
   * Build a progress percentage prefix like `  4%` for subagent lines.
   *
   * Each dispatched subagent contributes an equal share of the total progress
   * (e.g. 25% each when there are 4 subagents). Within its share, a subagent's
   * contribution is proportional to its own completed / total ratio.
   * This prevents the percentage from jumping backwards when a new subagent
   * starts reporting its (initially incomplete) todos.
   */
  private subagentProgressPrefix(): string {
    const numSubagents = this.dispatchedSubagents.length;
    if (numSubagents === 0) return '   ';

    const weightPerSubagent = 1 / numSubagents;
    let totalProgress = 0;

    for (const stateMap of this.subagentTodos.values()) {
      let subTotal = 0;
      let subCompleted = 0;
      for (const status of stateMap.values()) {
        if (status !== 'cancelled') subTotal++;
        if (status === 'completed') subCompleted++;
      }
      if (subTotal > 0) {
        totalProgress += (subCompleted / subTotal) * weightPerSubagent;
      }
    }

    const pct = Math.round(totalProgress * 100);
    return pc.dim(`${String(pct).padStart(3)}%`);
  }

  /**
   * Handle a `write_todos` tool call from a subagent.
   * Extracts the todo items and displays status transitions instead of
   * showing the raw `write_todos(todos: [...])` tool call signature.
   */
  private handleSubagentTodos(todos: AgentTodo[], nsKey: string, displayName: string): void {
    if (!this.subagentTodos.has(nsKey)) {
      this.subagentTodos.set(nsKey, new Map());
    }
    const stateMap = this.subagentTodos.get(nsKey)!;

    // First pass: update all state so the percentage reflects the full batch.
    const transitions: Array<{ todo: AgentTodo; prevStatus: string | undefined }> = [];
    for (const todo of todos) {
      const key = todo.content;
      const prevStatus = stateMap.get(key);
      const nextStatus = todo.status;

      if (prevStatus === nextStatus) continue;
      stateMap.set(key, nextStatus);
      transitions.push({ todo, prevStatus });
    }

    // Second pass: print status transitions with accurate percentages.
    for (const { todo, prevStatus } of transitions) {
      if (todo.status === 'completed' && prevStatus !== 'completed') {
        this.printHeaderOnce();
        const pct = this.subagentProgressPrefix();
        const label = `  ${pct} ${pc.cyan(`[${displayName}]`)} ${pc.green('✓')} ${todo.content}`;
        this.persistLine(' ', label);
      } else if (todo.status === 'in_progress' && prevStatus !== 'in_progress') {
        this.printHeaderOnce();
        const pct = this.subagentProgressPrefix();
        const label = `  ${pct} ${pc.cyan(`[${displayName}]`)} ${pc.yellow('▸')} ${pc.dim(todo.content)}`;
        this.persistLine(' ', label);
      }
    }
  }

  handleChunk(chunk: unknown, meta?: ChunkMeta): void {
    const isSubagent = meta?.isSubagent === true;
    const nsKey = normalizeNamespace(meta?.namespace);

    // --- Learn subagent name from model_request AIMessage ---
    if (isSubagent && nsKey && !this.namespaceToSubagentName.has(nsKey)) {
      const name = extractSubagentNameFromChunk(chunk);
      if (name) this.namespaceToSubagentName.set(nsKey, name);
    }

    // --- Handle tool calls ---
    const toolCalls = extractToolCallsFromStreamChunk(chunk);
    if (toolCalls && toolCalls.length > 0) {
      const newlyDispatched: string[] = [];

      for (const tc of toolCalls) {
        // When the main agent dispatches subagents, remember their names.
        if (!isSubagent && tc.name === 'task') {
          const subagentType = tc.args.subagent_type;
          if (
            typeof subagentType === 'string' &&
            !this.dispatchedSubagents.includes(subagentType)
          ) {
            this.dispatchedSubagents.push(subagentType);
            newlyDispatched.push(subagentType);
          }
        }

        // write_todos: for subagents, extract and display as progress items;
        // for the main agent, skip entirely (state transitions are handled below).
        if (tc.name === 'write_todos') {
          if (isSubagent) {
            const todos = tc.args.todos;
            if (Array.isArray(todos)) {
              const displayName = this.resolveSubagentName(nsKey, meta?.namespace);
              this.handleSubagentTodos(todos as AgentTodo[], nsKey, displayName);
              // Real write_todos supersedes auto-synthesized progress
              const autoNsKey = `auto:${displayName}`;
              if (this.subagentTodos.has(autoNsKey)) {
                this.subagentTodos.delete(autoNsKey);
                this.pendingAutoTasks.delete(displayName);
              }
            }
          }
          continue;
        }

        // Skip internal LangGraph structured-output extraction calls.
        if (tc.name.startsWith('extract')) continue;

        // Build a dedup key: for `task` calls, include `subagent_type`
        // so all 4 parallel task dispatches are shown (not just the first).
        const dedupKey =
          tc.name === 'task' && typeof tc.args.subagent_type === 'string'
            ? `task:${tc.args.subagent_type}`
            : tc.name;

        const signature = formatToolCall(tc);

        // Dedup strategy:
        //   - task calls: Set-based (prevents 3x printing across stream modes)
        //   - other main-agent calls: consecutive dedup (read→grep→read shows both reads)
        //   - subagent calls: consecutive dedup per namespace
        let isDuplicate: boolean;
        if (isSubagent) {
          const lastKey = this.lastSubagentToolCallKeys.get(nsKey);
          isDuplicate = dedupKey === lastKey;
          if (!isDuplicate) this.lastSubagentToolCallKeys.set(nsKey, dedupKey);
        } else if (dedupKey.startsWith('task:')) {
          isDuplicate = this.seenTaskKeys.has(dedupKey);
          if (!isDuplicate) this.seenTaskKeys.add(dedupKey);
        } else {
          isDuplicate = dedupKey === this.lastMainToolKey;
          this.lastMainToolKey = dedupKey;
        }

        if (!isDuplicate) {
          this.printHeaderOnce();

          const displayName = isSubagent ? this.resolveSubagentName(nsKey, meta?.namespace) : '';

          const label = isSubagent
            ? `      ↳ ${pc.cyan(`[${displayName}]`)} ${signature}`
            : `  ↳ ${signature}`;
          this.persistLine(' ', pc.dim(label));
        }
      }

      // Auto-synthesize "in_progress" entries for newly dispatched tasks.
      // This provides visual progress even when agents don't call write_todos.
      for (const name of newlyDispatched) {
        const autoNsKey = `auto:${name}`;
        this.handleSubagentTodos(
          [{ content: 'analyzing', status: 'in_progress' }],
          autoNsKey,
          name,
        );
        this.pendingAutoTasks.add(name);
      }

      // Auto-complete all pending task entries when the main agent makes a
      // non-task tool call (e.g. extract_findings), indicating subagents finished.
      if (!isSubagent && this.pendingAutoTasks.size > 0) {
        const hasNonTaskCalls = toolCalls.some(
          (tc) => tc.name !== 'task' && tc.name !== 'write_todos',
        );
        if (hasNonTaskCalls) {
          for (const name of this.pendingAutoTasks) {
            const autoNsKey = `auto:${name}`;
            this.handleSubagentTodos(
              [{ content: 'analyzing', status: 'completed' }],
              autoNsKey,
              name,
            );
          }
          this.pendingAutoTasks.clear();
        }
      }
    }

    // --- Handle main-agent todos ---
    // Subagent todos are handled above via write_todos tool call interception.
    if (isSubagent) return;

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
          this.persistLine(' ', `  ${this.progressPrefix()}${pc.green('✓')} ${todo.content}`);
          this.lastMainToolKey = undefined;
          this.seenTaskKeys.clear();
          this.lastSubagentToolCallKeys.clear();
        }

        if (nextStatus === 'in_progress' && this.lastInProgressKey !== key) {
          this.lastInProgressKey = key;
          this.currentInProgressContent = todo.content;
          this.printHeaderOnce();
          if (this.canAnimate) {
            this.updateSpinnerText(todo.content);
          }
          this.lastMainToolKey = undefined;
          this.seenTaskKeys.clear();
          this.lastSubagentToolCallKeys.clear();
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

/**
 * Normalize a LangGraph namespace to a stable string key for dedup.
 */
function normalizeNamespace(ns: unknown): string {
  if (typeof ns === 'string') return ns;
  if (Array.isArray(ns)) return ns.filter((s) => typeof s === 'string').join('|');
  return '';
}

/**
 * Try to extract a dispatched subagent name from the LangGraph namespace.
 *
 * Deepagents uses the subagent `name` field in the subgraph namespace path.
 * We check if any known dispatched subagent name appears in the namespace.
 */
function extractSubagentNameFromNamespace(ns: unknown, knownNames: string[]): string | undefined {
  const nsStr = normalizeNamespace(ns).toLowerCase();
  if (!nsStr) return undefined;
  for (const name of knownNames) {
    if (nsStr.includes(name.toLowerCase())) return name;
  }
  return undefined;
}

/**
 * Extract the subagent name from a stream chunk.
 *
 * LangGraph `model_request` updates for subagents contain an AIMessage with
 * a `name` field set to the subagent type (e.g. "listener-leak", "cpu-hotspot").
 * This allows us to map namespace UUIDs to human-readable subagent labels.
 */
function extractSubagentNameFromChunk(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') return;

  /** Try to extract a name from a single message object. */
  const nameFromMessage = (msg: unknown): string | undefined => {
    if (!msg || typeof msg !== 'object') return;
    // LangChain serialized form: { kwargs: { name: "..." } }
    const kwargs = (msg as { kwargs?: { name?: unknown } }).kwargs;
    if (kwargs && typeof kwargs.name === 'string' && kwargs.name.length > 0) {
      return kwargs.name;
    }
    // Direct form (runtime LangChain objects)
    const direct = msg as { name?: unknown };
    if (typeof direct.name === 'string' && direct.name.length > 0) {
      return direct.name;
    }
  };

  const obj = chunk as Record<string, unknown>;

  // 1. model_request updates: { model_request: { messages: [AIMessage{..., name: "..."}] } }
  const modelReq = obj.model_request as { messages?: unknown } | undefined;
  if (modelReq && Array.isArray(modelReq.messages)) {
    for (const msg of modelReq.messages) {
      const name = nameFromMessage(msg);
      if (name) return name;
    }
  }

  // 2. "values" mode: { messages: [HumanMessage, ..., AIMessage{..., name: "..."}] }
  //    Check the last message in the array (most likely the AIMessage).
  if (Array.isArray(obj.messages) && obj.messages.length > 0) {
    const last = obj.messages[obj.messages.length - 1];
    const name = nameFromMessage(last);
    if (name) return name;
  }

  // 3. Other nested updates: { nodeName: { messages: [...] } }
  for (const value of Object.values(obj)) {
    if (!value || typeof value !== 'object' || value === modelReq) continue;
    const nested = value as { messages?: unknown };
    if (!Array.isArray(nested.messages)) continue;
    for (const msg of nested.messages) {
      const name = nameFromMessage(msg);
      if (name) return name;
    }
  }
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
