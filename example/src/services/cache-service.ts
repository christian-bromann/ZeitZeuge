interface CacheEntry {
  value: unknown;
  createdAt: number;
  /**
   * PERF ISSUE [Closure Leak]: Stores a refresher function that captures
   * the original `value` and `requestContext` via closure, preventing
   * them from being garbage collected even when no longer needed.
   */
  refresher: () => Promise<unknown>;
  /** PERF ISSUE [Closure Leak]: Stores the full request context forever. */
  context: Record<string, unknown>;
}

class CacheService {
  /** PERF ISSUE [Closure Leak]: No eviction policy — cache grows forever. */
  private store = new Map<string, CacheEntry>();

  /**
   * PERF ISSUE [Closure Leak]: Accumulates metadata for every cache
   * access. Never trimmed, never bounded.
   */
  private accessLog: Array<{
    key: string;
    timestamp: number;
    context: Record<string, unknown>;
  }> = [];

  set(key: string, value: unknown, requestContext: Record<string, unknown> = {}): void {
    // PERF ISSUE [Closure Leak]: This closure captures `value` and
    // `requestContext` from the enclosing scope. Even when the cache
    // entry is conceptually stale, these references are retained.
    const refresher = async () => {
      const refreshed = JSON.parse(JSON.stringify(value));
      console.log(`Refreshing cache key: ${key}`, Object.keys(requestContext).length);
      return refreshed;
    };

    // PERF ISSUE [Slow Code Path]: Deep-clones the full request context
    // even though it is only stored for debugging purposes.
    const contextCopy = JSON.parse(JSON.stringify(requestContext)) as Record<string, unknown>;

    this.store.set(key, {
      value,
      createdAt: Date.now(),
      refresher,
      context: contextCopy,
    });
  }

  get(key: string, requestContext: Record<string, unknown> = {}): unknown | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    // PERF ISSUE [Closure Leak]: Logs every access with full context
    // — never trimmed, accumulates indefinitely.
    this.accessLog.push({
      key,
      timestamp: Date.now(),
      context: { ...requestContext, cachedAt: entry.createdAt },
    });

    // PERF ISSUE [Slow Code Path]: Deep-clones on every read.
    return JSON.parse(JSON.stringify(entry.value));
  }

  getStats(): { size: number; accessLogSize: number; keys: string[] } {
    return {
      size: this.store.size,
      accessLogSize: this.accessLog.length,
      keys: Array.from(this.store.keys()),
    };
  }

  // --- Test helpers (intentionally no TTL / eviction / clear) ---

  getAccessLogSize(): number {
    return this.accessLog.length;
  }

  getStoreSize(): number {
    return this.store.size;
  }

  reset(): void {
    this.store.clear();
    this.accessLog = [];
  }
}

export const cache = new CacheService();
