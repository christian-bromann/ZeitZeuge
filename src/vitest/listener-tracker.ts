/**
 * Event listener tracker — injected into Vitest worker processes via `--import`.
 *
 * Patches `EventTarget.prototype.addEventListener/removeEventListener` and
 * `EventEmitter.prototype.on/addListener/once/removeListener/off` to track
 * per-event-type add/remove counts and detect listener exceedances (more
 * listeners than `maxListeners` on a single target).
 *
 * On process exit, writes a JSON summary to the profile directory so the
 * zeitzeuge reporter can aggregate it across all workers.
 *
 * This module exports only the **script text generator**; the actual preload
 * script is an ESM `.mjs` module and runs inside the worker, not in the main
 * process. We use `--import` (stable since Node.js 20.6) instead of `--require`
 * to guarantee compatibility with ESM projects (`"type": "module"`).
 */

// ── Raw per-process data (written by the preload script) ─────

/** Shape of the JSON file written by each worker process. */
export interface RawListenerTrackingData {
  pid: number;
  eventTargetCounts: Record<string, { addCount: number; removeCount: number }>;
  emitterCounts: Record<string, { addCount: number; removeCount: number }>;
  exceedances: RawListenerExceedance[];
}

export interface RawListenerExceedance {
  targetType: string;
  eventType: string;
  listenerCount: number;
  threshold: number;
  stack: string;
}

// ── Aggregated data (used by metrics / workspace / terminal) ─

/** Aggregated event listener tracking data across all worker processes. */
export interface EventListenerTracking {
  /** Per-event-type add/remove counts for EventTarget APIs (e.g. AbortSignal). */
  eventTargetCounts: Record<string, { addCount: number; removeCount: number }>;
  /** Per-event-type add/remove counts for EventEmitter APIs. */
  emitterCounts: Record<string, { addCount: number; removeCount: number }>;
  /** Instances where a single target's listener count exceeded its maxListeners. */
  exceedances: ListenerExceedance[];
}

export interface ListenerExceedance {
  /** Class name of the target, e.g. "AbortSignal", "EventEmitter". */
  targetType: string;
  /** The event name, e.g. "abort", "data". */
  eventType: string;
  /** The listener count that triggered the exceedance. */
  listenerCount: number;
  /** The maxListeners threshold that was exceeded. */
  threshold: number;
  /** Short stack trace snippet captured at the exceedance point. */
  stack?: string;
}

// ── Imbalance detection ──────────────────────────────────────

/**
 * Minimum difference between add and remove counts before an event type
 * is considered to have a notable listener imbalance. Small imbalances
 * are normal (e.g. listeners added at startup that are never explicitly
 * removed because the process exits), so we tolerate a small surplus.
 */
export const LISTENER_IMBALANCE_THRESHOLD = 5;

export interface ListenerImbalance {
  /** Which API registered the listener ("EventTarget" or "EventEmitter"). */
  api: 'EventTarget' | 'EventEmitter';
  /** The event name, e.g. "abort", "data". */
  type: string;
  addCount: number;
  removeCount: number;
}

/**
 * Return event types where listeners were added significantly more often
 * than they were removed, combining both EventTarget and EventEmitter counts.
 *
 * Results are sorted by imbalance size (largest first).
 */
export function getListenerImbalances(tracking: EventListenerTracking): ListenerImbalance[] {
  return [
    ...Object.entries(tracking.eventTargetCounts).map(([t, c]) => ({
      api: 'EventTarget' as const,
      type: t,
      ...c,
    })),
    ...Object.entries(tracking.emitterCounts).map(([t, c]) => ({
      api: 'EventEmitter' as const,
      type: t,
      ...c,
    })),
  ]
    .filter((c) => c.addCount > c.removeCount + LISTENER_IMBALANCE_THRESHOLD)
    .sort((a, b) => b.addCount - b.removeCount - (a.addCount - a.removeCount));
}

// ── Preload script generator ─────────────────────────────────

/**
 * Generate the ESM preload script that will be injected into worker
 * processes via `--import`.
 *
 * The generated `.mjs` file uses ESM imports and runs before the worker
 * entry point. This guarantees compatibility with projects that use
 * `"type": "module"` in their `package.json`.
 *
 * @param outputDir Absolute path to the profile directory where the tracker
 *                  should write its JSON summary on process exit.
 */
export function generateListenerTrackerScript(outputDir: string): string {
  // The output dir is embedded as a JSON-safe string literal.
  return `// zeitzeuge: Event listener tracker (auto-injected via --import)
// Tracks EventTarget/EventEmitter listener add/remove patterns
// and writes a summary to the profile directory on process exit.

import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import EventEmitter from 'node:events';

const OUTPUT_DIR = ${JSON.stringify(outputDir)};

const data = {
  pid: process.pid,
  eventTargetCounts: {},
  emitterCounts: {},
  exceedances: [],
};

const DEFAULT_THRESHOLD = 10;
const seenExceedances = {};
const targetCounts = new WeakMap();

function getTC(target) {
  let c = targetCounts.get(target);
  if (!c) { c = {}; targetCounts.set(target, c); }
  return c;
}

function getType(target) {
  try { return target?.constructor?.name || 'unknown'; }
  catch { return 'unknown'; }
}

function trackAdd(countsObj, target, eventType) {
  const t = String(eventType);
  if (!countsObj[t]) countsObj[t] = { addCount: 0, removeCount: 0 };
  countsObj[t].addCount++;

  if (target) {
    const tc = getTC(target);
    const cur = (tc[t] || 0) + 1;
    tc[t] = cur;

    const thresh = (typeof target.getMaxListeners === 'function')
      ? target.getMaxListeners()
      : DEFAULT_THRESHOLD;

    // threshold === 0 means unlimited in Node.js (setMaxListeners(0))
    if (thresh > 0 && cur > thresh) {
      const tt = getType(target);
      const key = tt + ':' + t;
      if (!seenExceedances[key]) {
        seenExceedances[key] = true;
        let stack = '';
        try {
          stack = new Error().stack
            .split('\\n').slice(3, 7)
            .map((s) => s.trim())
            .join('\\n');
        } catch {}
        data.exceedances.push({
          targetType: tt,
          eventType: t,
          listenerCount: cur,
          threshold: thresh,
          stack,
        });
      }
    }
  }
}

function trackRemove(countsObj, target, eventType) {
  const t = String(eventType);
  if (!countsObj[t]) countsObj[t] = { addCount: 0, removeCount: 0 };
  countsObj[t].removeCount++;

  if (target) {
    const tc = getTC(target);
    const cur = (tc[t] || 0) - 1;
    tc[t] = cur > 0 ? cur : 0;
  }
}

// --- Patch EventTarget ---
try {
  if (typeof EventTarget !== 'undefined') {
    const origAEL = EventTarget.prototype.addEventListener;
    const origREL = EventTarget.prototype.removeEventListener;

    EventTarget.prototype.addEventListener = function(...args) {
      trackAdd(data.eventTargetCounts, this, args[0]);
      return origAEL.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function(...args) {
      trackRemove(data.eventTargetCounts, this, args[0]);
      return origREL.apply(this, args);
    };
  }
} catch {}

// --- Patch EventEmitter ---
try {
  const origOn = EventEmitter.prototype.on;
  const origAddListener = EventEmitter.prototype.addListener;
  const origOnce = EventEmitter.prototype.once;
  const origRemoveListener = EventEmitter.prototype.removeListener;
  const origOff = EventEmitter.prototype.off;

  EventEmitter.prototype.on = function(...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origOn.apply(this, args);
  };
  EventEmitter.prototype.addListener = function(...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origAddListener.apply(this, args);
  };
  EventEmitter.prototype.once = function(...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origOnce.apply(this, args);
  };
  EventEmitter.prototype.removeListener = function(...args) {
    trackRemove(data.emitterCounts, this, args[0]);
    return origRemoveListener.apply(this, args);
  };
  EventEmitter.prototype.off = function(...args) {
    trackRemove(data.emitterCounts, this, args[0]);
    return origOff.apply(this, args);
  };
} catch {}

// --- Write on exit ---
process.on('exit', () => {
  try {
    const hasData = data.exceedances.length > 0 ||
      Object.keys(data.eventTargetCounts).length > 0 ||
      Object.keys(data.emitterCounts).length > 0;
    if (!hasData) return;

    const outPath = join(OUTPUT_DIR, 'listener-tracking-' + process.pid + '.json');
    writeFileSync(outPath, JSON.stringify(data));
  } catch {}
});
`;
}

// ── Aggregation helper ───────────────────────────────────────

/**
 * Merge per-process listener tracking data from multiple workers
 * into a single aggregated summary.
 */
export function aggregateListenerTracking(
  entries: RawListenerTrackingData[],
): EventListenerTracking {
  const eventTargetCounts: Record<string, { addCount: number; removeCount: number }> = {};
  const emitterCounts: Record<string, { addCount: number; removeCount: number }> = {};
  const exceedances: ListenerExceedance[] = [];
  const seenExceedances = new Set<string>();

  for (const entry of entries) {
    // Merge EventTarget counts
    for (const [eventType, counts] of Object.entries(entry.eventTargetCounts)) {
      const existing = eventTargetCounts[eventType] ?? { addCount: 0, removeCount: 0 };
      existing.addCount += counts.addCount;
      existing.removeCount += counts.removeCount;
      eventTargetCounts[eventType] = existing;
    }

    // Merge EventEmitter counts
    for (const [eventType, counts] of Object.entries(entry.emitterCounts)) {
      const existing = emitterCounts[eventType] ?? { addCount: 0, removeCount: 0 };
      existing.addCount += counts.addCount;
      existing.removeCount += counts.removeCount;
      emitterCounts[eventType] = existing;
    }

    // Merge exceedances (deduplicate by targetType + eventType)
    for (const exc of entry.exceedances) {
      const key = `${exc.targetType}:${exc.eventType}`;
      if (!seenExceedances.has(key)) {
        seenExceedances.add(key);
        exceedances.push({
          targetType: exc.targetType,
          eventType: exc.eventType,
          listenerCount: exc.listenerCount,
          threshold: exc.threshold,
          stack: exc.stack || undefined,
        });
      }
    }
  }

  return { eventTargetCounts, emitterCounts, exceedances };
}
