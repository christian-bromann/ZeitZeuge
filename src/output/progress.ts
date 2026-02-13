import type { Ora } from 'ora';

type TodoStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled' | (string & {});

type AgentTodo = {
    content: string;
    status: TodoStatus;
    id?: string;
};

export class TodoProgressRenderer {
    private lastStatusByKey = new Map<string, string>();
    private lastInProgressKey: string | undefined;
    private baseSpinnerText: string | undefined;
    private printedHeader = false;

    constructor(private spinner?: Ora) {
        this.baseSpinnerText = spinner?.text;
    }

    private printHeaderOnce(): void {
        if (this.printedHeader) return;
        this.printedHeader = true;

        const header = 'Deep Agent progress:';
        if (this.spinner) {
            this.spinner.stopAndPersist({ symbol: ' ', text: header });
            this.spinner.start();
        } else {
            console.log(`\n${header}`);
        }
    }

    handleChunk(chunk: unknown): void {
        const todos = extractTodosFromStreamChunk(chunk);
        if (!todos) return;

        for (const todo of todos) {
            const key = (todo.id && String(todo.id)) || todo.content;
            const prevStatus = this.lastStatusByKey.get(key);
            const nextStatus = todo.status;

            if (prevStatus !== nextStatus) {
                this.lastStatusByKey.set(key, nextStatus);

                if (nextStatus === 'completed' && prevStatus !== 'completed') {
                    this.printHeaderOnce();
                    if (this.spinner) {
                        this.spinner.stopAndPersist({ symbol: ' ', text: `  ✓ ${todo.content}` });
                        this.spinner.start();
                    } else {
                        console.log(`  ✓ ${todo.content}`);
                    }
                }

                if (nextStatus === 'in_progress' && this.lastInProgressKey !== key) {
                    this.lastInProgressKey = key;
                    this.printHeaderOnce();
                    if (this.spinner) {
                        const base = this.baseSpinnerText ?? this.spinner.text;
                        this.spinner.text = base ? `${base} (${todo.content})` : todo.content;
                    } else {
                        console.log(`  → Next: ${todo.content}`);
                    }
                }
            }
        }
    }
}

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