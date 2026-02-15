import { db, type Task } from '../db.ts';

/**
 * Retrieves all tasks with optional filtering and sorting.
 */
export function getAllTasks(search?: string, status?: string, tag?: string): Task[] {
  // PERF ISSUE [Slow Code Path]: Deep-clones the entire task collection
  // via JSON round-trip on every read, even when no mutation occurs.
  const allTasks = JSON.parse(JSON.stringify(Array.from(db.tasks.values()))) as Task[];

  let results = allTasks;

  if (search) {
    // PERF ISSUE [Excessive Instantiation]: Compiles a new RegExp on
    // every call instead of caching the compiled pattern.
    const pattern = new RegExp(search, 'i');
    results = results.filter((task) => pattern.test(task.title) || pattern.test(task.description));
  }

  if (status) {
    results = results.filter((task) => task.status === status);
  }

  if (tag) {
    // PERF ISSUE [Slow Code Path]: Lowercases both sides on every
    // comparison instead of normalizing once.
    results = results.filter((task) =>
      task.tags.some((t) => t.toLowerCase() === tag.toLowerCase()),
    );
  }

  // PERF ISSUE [Slow Code Path]: Custom comparator recomputes priority
  // weights (including Date construction) on every comparison.
  results.sort((a, b) => {
    const weightA = computePriorityWeight(a);
    const weightB = computePriorityWeight(b);
    return weightA - weightB;
  });

  return results;
}

/**
 * Computes a sorting weight for a task based on priority, age, and tags.
 * Called from sort comparator — runs O(n log n) times per sort.
 */
function computePriorityWeight(task: Task): number {
  // PERF ISSUE [Excessive Instantiation]: Creates two Date objects
  // on every invocation — called inside a sort comparator.
  const created = new Date(task.createdAt);
  const now = new Date();
  const ageInDays = (now.getTime() - created.getTime()) / (1000 * 60 * 60 * 24);

  const statusWeight = task.status === 'pending' ? 3 : task.status === 'in-progress' ? 2 : 1;

  // PERF ISSUE [Slow Code Path]: Unnecessary join→split to count tags.
  const tagComplexity = task.tags.join(',').split(',').length;

  return task.priority * statusWeight - ageInDays * 0.1 + tagComplexity * 0.5;
}

/**
 * Retrieves a single task by ID.
 */
export function getTask(id: string): Task | undefined {
  const task = db.tasks.get(id);
  if (!task) return undefined;

  // PERF ISSUE [Slow Code Path]: Deep-clones a single item via JSON
  // round-trip when a shallow copy or direct reference would suffice.
  return JSON.parse(JSON.stringify(task)) as Task;
}

/**
 * Creates a new task and persists it to the database.
 */
export function createTask(input: {
  title: string;
  description?: string;
  priority?: number;
  tags?: string[];
  assignee?: string | null;
}): Task {
  const id = db.nextId();
  const now = new Date().toISOString();

  const task: Task = {
    id,
    title: input.title,
    description: input.description ?? '',
    status: 'pending',
    priority: input.priority ?? 3,
    tags: input.tags ?? [],
    assignee: input.assignee ?? null,
    createdAt: now,
    updatedAt: now,
  };

  db.tasks.set(id, task);
  db.events.emit('task:created', task);
  db.events.emit('task:changed', { action: 'created', task });

  // PERF ISSUE [Blocking]: Synchronous audit logging with redundant
  // JSON serialization round-trip.
  logAudit('create', id, task);

  return task;
}

/**
 * Updates an existing task with partial data.
 */
export function updateTask(
  id: string,
  input: Partial<Omit<Task, 'id' | 'createdAt'>>,
): Task | undefined {
  const existing = db.tasks.get(id);
  if (!existing) return undefined;

  const updated: Task = {
    ...existing,
    ...input,
    id: existing.id,
    createdAt: existing.createdAt,
    updatedAt: new Date().toISOString(),
  };

  db.tasks.set(id, updated);
  db.events.emit('task:updated', updated);
  db.events.emit('task:changed', { action: 'updated', task: updated });

  logAudit('update', id, { before: existing, after: updated });

  return updated;
}

/**
 * Deletes a task by ID.
 */
export function deleteTask(id: string): boolean {
  const existing = db.tasks.get(id);
  if (!existing) return false;

  db.tasks.delete(id);
  db.events.emit('task:deleted', existing);
  db.events.emit('task:changed', { action: 'deleted', task: existing });

  logAudit('delete', id, existing);

  return true;
}

/**
 * PERF ISSUE [Blocking]: Synchronous audit logging that performs
 * redundant JSON serialize→deserialize on the payload.
 */
function logAudit(action: string, taskId: string, payload: unknown): void {
  const serialized = JSON.stringify(payload);
  const deserialized = JSON.parse(serialized);

  db.audit.push({
    timestamp: new Date().toISOString(),
    action,
    taskId,
    payload: deserialized,
  });
}
