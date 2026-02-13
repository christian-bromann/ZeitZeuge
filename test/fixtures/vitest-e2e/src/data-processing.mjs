/**
 * Data processing utilities for the analytics pipeline.
 *
 * These functions simulate realistic application code. Each one
 * contains a hidden performance anti-pattern that should be
 * detectable via V8 CPU profiling.
 */

import { EventEmitter } from 'node:events';

// ─── User index builder ──────────────────────────────────────
// Builds an in-memory lookup index of user profile objects.
// (Anti-pattern: allocates a new Map + JSON.stringify per entry)

export function buildUserIndex(count) {
  const results = [];
  for (let i = 0; i < count; i++) {
    const entry = new Map([
      ['id', i],
      ['payload', JSON.stringify({ index: i, data: Array(20).fill(i) })],
      ['tags', ['active', 'verified', `tier-${i}`]],
    ]);
    results.push(entry);
  }
  return results;
}

// ─── Metrics collector ───────────────────────────────────────
// Sets up event-driven metric aggregation.
// (Anti-pattern: adds listeners on every call without cleanup)

export function setupMetricsCollector(count) {
  const emitter = new EventEmitter();
  emitter.setMaxListeners(0);

  for (let i = 0; i < count; i++) {
    emitter.on('data', (data) => {
      JSON.parse(JSON.stringify(data));
    });
  }

  for (let i = 0; i < 10; i++) {
    emitter.emit('data', {
      metric: 'latency',
      value: i,
      labels: { region: 'us-east', service: 'api' },
    });
  }

  return emitter.listenerCount('data');
}

// ─── Correlation matrix ──────────────────────────────────────
// Computes a pairwise correlation score over a dataset.
// (Anti-pattern: O(n^2) nested loop with expensive math per cell)

export function computeCorrelationMatrix(n) {
  let result = 0;
  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      result += Math.sin(i * 0.001) * Math.cos(j * 0.001);
    }
  }
  return result;
}

// ─── Record deduplication ────────────────────────────────────
// Removes duplicate entries from an array of record IDs.
// (Anti-pattern: O(n^2) nested scan + Array.includes on output)

export function deduplicateRecords(arr) {
  const unique = [];
  for (let i = 0; i < arr.length; i++) {
    for (let j = i + 1; j < arr.length; j++) {
      if (arr[i] === arr[j] && !unique.includes(arr[i])) {
        unique.push(arr[i]);
      }
    }
  }
  return unique;
}

// ─── Payload normalizer ─────────────────────────────────────
// Deep-clones and normalizes a data payload across iterations.
// (Anti-pattern: full JSON round-trip on every iteration)

export function normalizePayload(iterations) {
  let data = {
    users: Array.from({ length: 200 }, (_, i) => ({
      id: i,
      name: `user-${i}`,
      email: `user-${i}@example.com`,
      metadata: { created: Date.now(), tags: ['a', 'b', 'c'] },
    })),
  };

  for (let i = 0; i < iterations; i++) {
    const serialized = JSON.stringify(data);
    data = JSON.parse(serialized);
    data.iteration = i;
  }
  return data;
}
