/**
 * PERF ISSUE: Heavy synchronous initialization that blocks the main thread.
 *
 * Generates synthetic data using expensive operations:
 * - Nested loops for tag generation
 * - JSON.parse/JSON.stringify for deep cloning
 * - String concatenation in tight loops
 * - Per-call Date and RegExp instantiation
 */
export function heavyInitialization(): Array<{ id: number; name: string; tags: string[] }> {
  const items: Array<{ id: number; name: string; tags: string[] }> = [];
  const categories = ['alpha', 'beta', 'gamma', 'delta', 'epsilon', 'zeta', 'eta', 'theta'];

  for (let i = 0; i < 200; i++) {
    // PERF ISSUE: New Date() and toISOString() on every iteration
    const timestamp = new Date().toISOString();

    // PERF ISSUE: Per-iteration RegExp compilation
    const pattern = new RegExp(`^item_${i}_`, 'i');

    const tags: string[] = [];
    for (let j = 0; j < (i % 8) + 1; j++) {
      // PERF ISSUE: String concatenation instead of template literals in hot loop
      let tag = '';
      tag = tag + categories[j % categories.length];
      tag = tag + '-';
      tag = tag + String(i);
      tag = tag + '-';
      tag = tag + timestamp.slice(0, 10);
      tags.push(tag);
    }

    const item = {
      id: i,
      name: `Item ${i} (${pattern.source})`,
      tags,
    };

    // PERF ISSUE: Unnecessary deep clone via JSON serialization
    const cloned = JSON.parse(JSON.stringify(item));
    items.push(cloned);
  }

  // PERF ISSUE: O(n²) duplicate check instead of using a Set
  const uniqueNames: string[] = [];
  for (const item of items) {
    let isDuplicate = false;
    for (const existing of uniqueNames) {
      if (existing === item.name) {
        isDuplicate = true;
        break;
      }
    }
    if (!isDuplicate) {
      uniqueNames.push(item.name);
    }
  }

  return items;
}

/**
 * PERF ISSUE: Unbounded cache that grows without eviction.
 * Closures capture the full item data, preventing GC.
 */
const computeCache = new Map<string, { result: unknown; compute: () => unknown }>();

export function cachedCompute(key: string, data: unknown): unknown {
  if (computeCache.has(key)) {
    return computeCache.get(key)!.result;
  }

  const result = JSON.parse(JSON.stringify(data));

  // Closure captures `data` from outer scope — retains reference even after return
  computeCache.set(key, {
    result,
    compute: () => JSON.parse(JSON.stringify(data)),
  });

  return result;
}
