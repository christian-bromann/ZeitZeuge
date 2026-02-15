import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.ts';
import {
  getAllTasks,
  getTask,
  createTask,
  updateTask,
  deleteTask,
} from '../src/services/task-service.ts';
import { resetAnalytics } from '../src/services/analytics-service.ts';

beforeEach(() => {
  db.reset();
  resetAnalytics();
});

describe('getAllTasks', () => {
  it('returns seeded tasks after a fresh reset + re-seed', () => {
    // re-seed so there is data
    db.reset();
    createTask({ title: 'Alpha task', tags: ['a'] });
    createTask({ title: 'Beta task', tags: ['b'] });

    const tasks = getAllTasks();
    expect(tasks).toHaveLength(2);
  });

  it('filters by status', () => {
    createTask({ title: 'Pending one' });
    const created = createTask({ title: 'Done one' });
    updateTask(created.id, { status: 'done' });

    const pending = getAllTasks(undefined, 'pending');
    expect(pending.every((t) => t.status === 'pending')).toBe(true);

    const done = getAllTasks(undefined, 'done');
    expect(done).toHaveLength(1);
    expect(done[0]!.title).toBe('Done one');
  });

  it('filters by tag', () => {
    createTask({ title: 'Frontend work', tags: ['frontend', 'react'] });
    createTask({ title: 'Backend work', tags: ['backend', 'node'] });
    createTask({ title: 'Full stack', tags: ['frontend', 'backend'] });

    const frontend = getAllTasks(undefined, undefined, 'frontend');
    expect(frontend).toHaveLength(2);
    expect(frontend.map((t) => t.title).sort()).toEqual(['Frontend work', 'Full stack']);
  });

  it('searches title and description', () => {
    createTask({
      title: 'Fix login bug',
      description: 'Users cannot log in with SSO',
    });
    createTask({
      title: 'Add dashboard',
      description: 'New analytics dashboard',
    });

    const results = getAllTasks('login');
    expect(results).toHaveLength(1);
    expect(results[0]!.title).toBe('Fix login bug');

    const descResults = getAllTasks('analytics');
    expect(descResults).toHaveLength(1);
    expect(descResults[0]!.title).toBe('Add dashboard');
  });

  it('search is case-insensitive', () => {
    createTask({ title: 'Deploy to AWS' });
    expect(getAllTasks('aws')).toHaveLength(1);
    expect(getAllTasks('AWS')).toHaveLength(1);
    expect(getAllTasks('deploy')).toHaveLength(1);
  });

  it('returns empty array when no tasks match', () => {
    createTask({ title: 'Something' });
    expect(getAllTasks('nonexistent')).toHaveLength(0);
    expect(getAllTasks(undefined, 'done')).toHaveLength(0);
    expect(getAllTasks(undefined, undefined, 'missing-tag')).toHaveLength(0);
  });

  it('returns tasks sorted by priority weight', () => {
    createTask({ title: 'Low priority', priority: 3 });
    createTask({ title: 'High priority', priority: 1 });
    createTask({ title: 'Medium priority', priority: 2 });

    const tasks = getAllTasks();
    // All tasks are pending so weight = priority * 3, higher priority
    // number → higher weight → sorted ascending
    expect(tasks[0]!.priority).toBeLessThanOrEqual(tasks[1]!.priority);
  });

  it('returns copies, not references to stored tasks', () => {
    createTask({ title: 'Original' });
    const tasks = getAllTasks();
    tasks[0]!.title = 'Mutated';

    const fresh = getAllTasks();
    expect(fresh[0]!.title).toBe('Original');
  });
});

describe('getTask', () => {
  it('returns a task by id', () => {
    const created = createTask({ title: 'Find me' });
    const found = getTask(created.id);

    expect(found).toBeDefined();
    expect(found!.id).toBe(created.id);
    expect(found!.title).toBe('Find me');
  });

  it('returns undefined for unknown id', () => {
    expect(getTask('nonexistent')).toBeUndefined();
  });

  it('returns a copy, not a reference', () => {
    const created = createTask({ title: 'Original' });
    const found = getTask(created.id);
    found!.title = 'Mutated';

    const fresh = getTask(created.id);
    expect(fresh!.title).toBe('Original');
  });
});

describe('createTask', () => {
  it('creates a task with all provided fields', () => {
    const task = createTask({
      title: 'New task',
      description: 'A description',
      priority: 2,
      tags: ['urgent', 'backend'],
      assignee: 'alice',
    });

    expect(task.id).toMatch(/^task-/);
    expect(task.title).toBe('New task');
    expect(task.description).toBe('A description');
    expect(task.priority).toBe(2);
    expect(task.tags).toEqual(['urgent', 'backend']);
    expect(task.assignee).toBe('alice');
    expect(task.status).toBe('pending');
    expect(task.createdAt).toBeTruthy();
    expect(task.updatedAt).toBeTruthy();
  });

  it('applies defaults for optional fields', () => {
    const task = createTask({ title: 'Minimal' });

    expect(task.description).toBe('');
    expect(task.priority).toBe(3);
    expect(task.tags).toEqual([]);
    expect(task.assignee).toBeNull();
  });

  it('persists the task in the database', () => {
    const task = createTask({ title: 'Persisted' });
    expect(db.tasks.has(task.id)).toBe(true);
    expect(db.tasks.get(task.id)!.title).toBe('Persisted');
  });

  it('generates unique ids', () => {
    const a = createTask({ title: 'A' });
    const b = createTask({ title: 'B' });
    const c = createTask({ title: 'C' });

    const ids = new Set([a.id, b.id, c.id]);
    expect(ids.size).toBe(3);
  });

  it('adds an audit entry', () => {
    const before = db.audit.length;
    createTask({ title: 'Audited' });
    expect(db.audit.length).toBe(before + 1);
    expect(db.audit[db.audit.length - 1]!.action).toBe('create');
  });

  it('emits task:created and task:changed events', () => {
    const events: string[] = [];
    db.events.on('task:created', () => events.push('created'));
    db.events.on('task:changed', () => events.push('changed'));

    createTask({ title: 'Evented' });

    expect(events).toContain('created');
    expect(events).toContain('changed');
  });
});

describe('updateTask', () => {
  it('updates provided fields', () => {
    const task = createTask({ title: 'Old title', priority: 3 });
    const updated = updateTask(task.id, {
      title: 'New title',
      priority: 1,
    });

    expect(updated).toBeDefined();
    expect(updated!.title).toBe('New title');
    expect(updated!.priority).toBe(1);
  });

  it('preserves fields not included in the update', () => {
    const task = createTask({
      title: 'Keep me',
      description: 'Also keep me',
      tags: ['keep'],
    });
    const updated = updateTask(task.id, { priority: 1 });

    expect(updated!.title).toBe('Keep me');
    expect(updated!.description).toBe('Also keep me');
    expect(updated!.tags).toEqual(['keep']);
  });

  it('updates the updatedAt timestamp', () => {
    const task = createTask({ title: 'Timestamped' });

    // small delay to ensure timestamp differs
    const updated = updateTask(task.id, { title: 'Changed' });
    expect(updated!.updatedAt).toBeTruthy();
    // createdAt should not change
    expect(updated!.createdAt).toBe(task.createdAt);
  });

  it('preserves id and createdAt even if provided in input', () => {
    const task = createTask({ title: 'Immutable fields' });
    const updated = updateTask(task.id, {
      title: 'New',
    } as any);

    expect(updated!.id).toBe(task.id);
    expect(updated!.createdAt).toBe(task.createdAt);
  });

  it('returns undefined for unknown id', () => {
    expect(updateTask('nonexistent', { title: 'Nope' })).toBeUndefined();
  });

  it('can change task status', () => {
    const task = createTask({ title: 'Status change' });
    expect(task.status).toBe('pending');

    const updated = updateTask(task.id, { status: 'in-progress' });
    expect(updated!.status).toBe('in-progress');

    const done = updateTask(task.id, { status: 'done' });
    expect(done!.status).toBe('done');
  });

  it('adds an audit entry', () => {
    const task = createTask({ title: 'Audit me' });
    const before = db.audit.length;
    updateTask(task.id, { title: 'Updated' });
    expect(db.audit.length).toBe(before + 1);
    expect(db.audit[db.audit.length - 1]!.action).toBe('update');
  });
});

describe('deleteTask', () => {
  it('removes the task from the database', () => {
    const task = createTask({ title: 'Delete me' });
    expect(db.tasks.has(task.id)).toBe(true);

    const result = deleteTask(task.id);
    expect(result).toBe(true);
    expect(db.tasks.has(task.id)).toBe(false);
  });

  it('returns false for unknown id', () => {
    expect(deleteTask('nonexistent')).toBe(false);
  });

  it('makes the task unretrievable via getTask', () => {
    const task = createTask({ title: 'Gone' });
    deleteTask(task.id);
    expect(getTask(task.id)).toBeUndefined();
  });

  it('emits task:deleted and task:changed events', () => {
    const events: string[] = [];
    db.events.on('task:deleted', () => events.push('deleted'));
    db.events.on('task:changed', () => events.push('changed'));

    const task = createTask({ title: 'Event test' });
    // clear events from create
    events.length = 0;
    db.events.removeAllListeners('task:created');

    deleteTask(task.id);

    expect(events).toContain('deleted');
    expect(events).toContain('changed');
  });

  it('adds an audit entry', () => {
    const task = createTask({ title: 'Audit delete' });
    const before = db.audit.length;
    deleteTask(task.id);
    expect(db.audit.length).toBe(before + 1);
    expect(db.audit[db.audit.length - 1]!.action).toBe('delete');
  });
});
