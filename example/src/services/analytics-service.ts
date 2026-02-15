import { db, type Task } from '../db.ts';

interface AnalyticsSummary {
  totalTasks: number;
  byStatus: Record<string, number>;
  byPriority: Record<number, number>;
  byAssignee: Record<string, number>;
  tagCorrelations: Array<{ tag1: string; tag2: string; count: number }>;
  averageTaskAge: number;
}

let analyticsCache: AnalyticsSummary | null = null;

/**
 * Returns analytics about the current task set.
 *
 * PERF ISSUE [Event Listener Leak]: Every call to this function adds a
 * new `task:changed` listener to invalidate the cache, but never removes
 * previously registered listeners. After N calls, N listeners are active.
 */
export function getAnalytics(): AnalyticsSummary {
  const tasks = Array.from(db.tasks.values());

  // PERF ISSUE [Event Listener Leak]: Adds a new listener on every call.
  // The developer intended to "subscribe to changes so the cache stays
  // fresh," but this creates unbounded listener growth.
  db.events.on('task:changed', () => {
    analyticsCache = null;
  });

  if (analyticsCache) {
    return analyticsCache;
  }

  const summary = computeAnalytics(tasks);
  analyticsCache = summary;
  return summary;
}

function computeAnalytics(tasks: Task[]): AnalyticsSummary {
  const byStatus: Record<string, number> = {};
  const byPriority: Record<number, number> = {};
  const byAssignee: Record<string, number> = {};

  for (const task of tasks) {
    byStatus[task.status] = (byStatus[task.status] ?? 0) + 1;
    byPriority[task.priority] = (byPriority[task.priority] ?? 0) + 1;
    if (task.assignee) {
      byAssignee[task.assignee] = (byAssignee[task.assignee] ?? 0) + 1;
    }
  }

  // PERF ISSUE [Slow Code Path]: O(n² × m²) tag correlation.
  const tagCorrelations = computeTagCorrelations(tasks);

  // PERF ISSUE [Excessive Instantiation]: Creates a new Date object
  // per task inside the loop. `now` is also recreated (though only once).
  const now = new Date();
  let totalAge = 0;
  for (const task of tasks) {
    const created = new Date(task.createdAt);
    totalAge += now.getTime() - created.getTime();
  }
  const averageTaskAge = tasks.length > 0 ? totalAge / tasks.length : 0;

  return {
    totalTasks: tasks.length,
    byStatus,
    byPriority,
    byAssignee,
    tagCorrelations,
    averageTaskAge,
  };
}

/**
 * PERF ISSUE [Slow Code Path]: O(n² × m²) where n = number of tasks and
 * m = average number of tags per task. Compares every pair of tasks and
 * every pair of their tags.
 */
function computeTagCorrelations(
  tasks: Task[],
): Array<{ tag1: string; tag2: string; count: number }> {
  const correlations = new Map<string, number>();

  for (let i = 0; i < tasks.length; i++) {
    for (let j = i + 1; j < tasks.length; j++) {
      const task1 = tasks[i]!;
      const task2 = tasks[j]!;

      for (const tag1 of task1.tags) {
        for (const tag2 of task2.tags) {
          if (tag1 === tag2) continue;
          // PERF ISSUE [Excessive Instantiation]: Sorts and joins
          // two strings on every inner-loop iteration.
          const key = [tag1, tag2].sort().join(':');
          correlations.set(key, (correlations.get(key) ?? 0) + 1);
        }
      }
    }
  }

  return Array.from(correlations.entries())
    .map(([key, count]) => {
      const [tag1, tag2] = key.split(':');
      return { tag1: tag1!, tag2: tag2!, count };
    })
    .sort((a, b) => b.count - a.count);
}

/** Returns the current listener count for testing. */
export function getListenerCount(): number {
  return db.events.listenerCount('task:changed');
}

/** Resets analytics state and removes all listeners. */
export function resetAnalytics(): void {
  analyticsCache = null;
  db.events.removeAllListeners('task:changed');
}
