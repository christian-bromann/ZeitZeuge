/**
 * Merge hot functions from multiple profiles, deduplicating by
 * (scriptUrl, functionName, lineNumber) and summing selfTime.
 */

import type { CorrelatedProfile, HotFunction } from '../types.js';

export function mergeHotFunctions(profiles: CorrelatedProfile[]): HotFunction[] {
  const merged = new Map<string, HotFunction>();
  let totalDuration = 0;

  for (const profile of profiles) {
    totalDuration += profile.summary.duration;

    for (const fn of profile.summary.hotFunctions) {
      const key = `${fn.scriptUrl}:${fn.functionName}:${fn.lineNumber}`;
      const existing = merged.get(key);
      if (existing) {
        existing.selfTime += fn.selfTime;
        existing.totalTime += fn.totalTime;
        existing.hitCount += fn.hitCount;
      } else {
        merged.set(key, { ...fn });
      }
    }
  }

  if (totalDuration > 0) {
    for (const fn of merged.values()) {
      fn.selfPercent = round((fn.selfTime / totalDuration) * 100);
    }
  }

  const results = Array.from(merged.values());
  results.sort((a, b) => b.selfTime - a.selfTime);

  return results.slice(0, 50);
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
