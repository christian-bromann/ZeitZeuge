import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '../src/db.ts';
import { createTask } from '../src/services/task-service.ts';
import {
  getAnalytics,
  getListenerCount,
  resetAnalytics,
} from '../src/services/analytics-service.ts';

beforeEach(() => {
  db.reset();
  resetAnalytics();
});

describe('getAnalytics', () => {
  it('returns zero totals for an empty database', () => {
    const analytics = getAnalytics();

    expect(analytics.totalTasks).toBe(0);
    expect(analytics.byStatus).toEqual({});
    expect(analytics.byPriority).toEqual({});
    expect(analytics.byAssignee).toEqual({});
    expect(analytics.tagCorrelations).toEqual([]);
    expect(analytics.averageTaskAge).toBe(0);
  });

  it('counts tasks by status', () => {
    createTask({ title: 'A' }); // pending
    createTask({ title: 'B' }); // pending
    createTask({ title: 'C' }); // pending

    // move one to done
    const tasks = Array.from(db.tasks.values());
    db.tasks.set(tasks[0]!.id, { ...tasks[0]!, status: 'done' });
    db.tasks.set(tasks[1]!.id, { ...tasks[1]!, status: 'in-progress' });

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics.byStatus['pending']).toBe(1);
    expect(analytics.byStatus['in-progress']).toBe(1);
    expect(analytics.byStatus['done']).toBe(1);
  });

  it('counts tasks by priority', () => {
    createTask({ title: 'P1', priority: 1 });
    createTask({ title: 'P1 again', priority: 1 });
    createTask({ title: 'P2', priority: 2 });
    createTask({ title: 'P3', priority: 3 });

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics.byPriority[1]).toBe(2);
    expect(analytics.byPriority[2]).toBe(1);
    expect(analytics.byPriority[3]).toBe(1);
  });

  it('counts tasks by assignee', () => {
    createTask({ title: 'A1', assignee: 'alice' });
    createTask({ title: 'A2', assignee: 'alice' });
    createTask({ title: 'B1', assignee: 'bob' });
    createTask({ title: 'U1', assignee: null }); // unassigned

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics.byAssignee['alice']).toBe(2);
    expect(analytics.byAssignee['bob']).toBe(1);
    expect(analytics.byAssignee['null']).toBeUndefined();
    // unassigned tasks shouldn't appear in byAssignee
  });

  it('reports correct total task count', () => {
    createTask({ title: 'One' });
    createTask({ title: 'Two' });
    createTask({ title: 'Three' });

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics.totalTasks).toBe(3);
  });

  it('computes tag correlations between tasks', () => {
    createTask({ title: 'A', tags: ['frontend', 'react'] });
    createTask({ title: 'B', tags: ['frontend', 'vue'] });

    resetAnalytics();
    const analytics = getAnalytics();

    // Tasks A and B share no identical tags but have cross-tag pairs:
    // (frontend, vue), (frontend, react), (react, vue), (react, frontend)
    // After dedup: correlations between different tags across tasks
    expect(analytics.tagCorrelations.length).toBeGreaterThan(0);
  });

  it('computes a non-negative average task age', () => {
    createTask({ title: 'Recent task' });

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics.averageTaskAge).toBeGreaterThanOrEqual(0);
  });

  it('returns all expected fields', () => {
    createTask({ title: 'Schema check', tags: ['test'] });

    resetAnalytics();
    const analytics = getAnalytics();

    expect(analytics).toHaveProperty('totalTasks');
    expect(analytics).toHaveProperty('byStatus');
    expect(analytics).toHaveProperty('byPriority');
    expect(analytics).toHaveProperty('byAssignee');
    expect(analytics).toHaveProperty('tagCorrelations');
    expect(analytics).toHaveProperty('averageTaskAge');
  });
});

describe('resetAnalytics', () => {
  it('clears the analytics cache so next call recomputes', () => {
    createTask({ title: 'Before' });
    resetAnalytics();
    const before = getAnalytics();
    expect(before.totalTasks).toBe(1);

    createTask({ title: 'After' });
    resetAnalytics();
    const after = getAnalytics();
    expect(after.totalTasks).toBe(2);
  });

  it('removes task:changed listeners', () => {
    // calling getAnalytics adds listeners
    getAnalytics();
    getAnalytics();
    getAnalytics();

    expect(getListenerCount()).toBeGreaterThan(0);

    resetAnalytics();
    expect(getListenerCount()).toBe(0);
  });
});
