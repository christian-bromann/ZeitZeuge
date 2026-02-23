// zeitzeuge: Event listener tracker (auto-injected via --import)
// Tracks EventTarget/EventEmitter listener add/remove patterns
// and appends a summary line to a shared JSONL file on process exit.

import { appendFileSync } from 'node:fs';
import { join } from 'node:path';
import EventEmitter from 'node:events';

const OUTPUT_DIR = '/Users/christian.bromann/Sites/LangChain/perfagent/example/.zeitzeuge-profiles';

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
  if (!c) {
    c = {};
    targetCounts.set(target, c);
  }
  return c;
}

function getType(target) {
  try {
    return target?.constructor?.name || 'unknown';
  } catch {
    return 'unknown';
  }
}

function trackAdd(countsObj, target, eventType) {
  const t = String(eventType);
  if (!countsObj[t]) countsObj[t] = { addCount: 0, removeCount: 0 };
  countsObj[t].addCount++;

  if (target) {
    const tc = getTC(target);
    const cur = (tc[t] || 0) + 1;
    tc[t] = cur;

    const thresh =
      typeof target.getMaxListeners === 'function' ? target.getMaxListeners() : DEFAULT_THRESHOLD;

    // threshold === 0 means unlimited in Node.js (setMaxListeners(0))
    if (thresh > 0 && cur > thresh) {
      const tt = getType(target);
      const key = tt + ':' + t;
      if (!seenExceedances[key]) {
        seenExceedances[key] = true;
        let stack = '';
        try {
          stack = new Error().stack
            .split('\n')
            .slice(3, 7)
            .map((s) => s.trim())
            .join('\n');
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

    EventTarget.prototype.addEventListener = function (...args) {
      trackAdd(data.eventTargetCounts, this, args[0]);
      return origAEL.apply(this, args);
    };
    EventTarget.prototype.removeEventListener = function (...args) {
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

  EventEmitter.prototype.on = function (...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origOn.apply(this, args);
  };
  EventEmitter.prototype.addListener = function (...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origAddListener.apply(this, args);
  };
  EventEmitter.prototype.once = function (...args) {
    trackAdd(data.emitterCounts, this, args[0]);
    return origOnce.apply(this, args);
  };
  EventEmitter.prototype.removeListener = function (...args) {
    trackRemove(data.emitterCounts, this, args[0]);
    return origRemoveListener.apply(this, args);
  };
  EventEmitter.prototype.off = function (...args) {
    trackRemove(data.emitterCounts, this, args[0]);
    return origOff.apply(this, args);
  };
} catch {}

// --- Write on exit ---
process.on('exit', () => {
  try {
    const hasData =
      data.exceedances.length > 0 ||
      Object.keys(data.eventTargetCounts).length > 0 ||
      Object.keys(data.emitterCounts).length > 0;
    if (!hasData) return;

    // Append a single JSON line to the shared JSONL file.
    // Each line is well under PIPE_BUF so O_APPEND guarantees atomicity.
    const outPath = join(OUTPUT_DIR, 'listener-tracking.jsonl');
    appendFileSync(outPath, JSON.stringify(data) + '\n');
  } catch {}
});
