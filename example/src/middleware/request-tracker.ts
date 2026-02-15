interface RequestRecord {
  method: string;
  path: string;
  timestamp: number;
  duration: number | null;
  requestBody: unknown;
  /**
   * PERF ISSUE [Closure Leak]: This closure captures `body` (which may
   * be large) and `record` itself, preventing either from being collected.
   */
  getDetails: () => Record<string, unknown>;
}

class RequestTracker {
  /**
   * PERF ISSUE [Closure Leak]: Grows without bound — stores a record
   * for every request ever handled. No eviction, rotation, or cap.
   */
  private records: RequestRecord[] = [];

  /**
   * Track a request. Returns a `finish` callback that records the
   * final duration.
   */
  track(method: string, path: string, body: unknown): () => void {
    const startTime = performance.now();

    const record: RequestRecord = {
      method,
      path,
      timestamp: Date.now(),
      duration: null,
      requestBody: body,
      // PERF ISSUE [Closure Leak]: Captures `body` and `record` from
      // the enclosing scope. Even after the HTTP response is sent,
      // these references remain alive in the closure.
      getDetails: () => ({
        ...record,
        bodySize: JSON.stringify(body ?? '').length,
        elapsedSinceTracked: Date.now() - record.timestamp,
      }),
    };

    this.records.push(record);

    // The returned "finish" function also captures scope variables.
    return () => {
      record.duration = performance.now() - startTime;
    };
  }

  /**
   * PERF ISSUE [Slow Code Path]: Recomputes statistics from scratch
   * on every call — iterates the full (unbounded) record list twice.
   */
  getStats(): {
    totalRequests: number;
    averageDuration: number;
    slowestEndpoint: string | null;
  } {
    const completed = this.records.filter((r) => r.duration !== null);
    const total = completed.reduce((sum, r) => sum + (r.duration ?? 0), 0);

    let slowest: RequestRecord | null = null;
    for (const record of completed) {
      if (!slowest || (record.duration ?? 0) > (slowest.duration ?? 0)) {
        slowest = record;
      }
    }

    return {
      totalRequests: this.records.length,
      averageDuration: completed.length > 0 ? total / completed.length : 0,
      slowestEndpoint: slowest ? `${slowest.method} ${slowest.path}` : null,
    };
  }

  getRecordCount(): number {
    return this.records.length;
  }

  reset(): void {
    this.records = [];
  }
}

export const tracker = new RequestTracker();
