import type { TraceEvent } from '../../src/types';

/**
 * Navigation start timestamp in microseconds.
 * All event timestamps are relative to this.
 */
export const NAVIGATION_START_TS = 1_000_000; // 1 second in μs

/**
 * Main thread ID used in the fixture.
 */
export const MAIN_THREAD_ID = 1;

/**
 * Secondary thread ID (e.g., worker) — used to test main-thread filtering.
 */
export const SECONDARY_THREAD_ID = 2;

/**
 * A realistic Chrome trace fixture for testing the runtime trace parser.
 *
 * Contains:
 * - __metadata thread_name event for CrRendererMain (tid: 1)
 * - 3 FunctionCall events: one 80ms (blocking), one 30ms, one 10ms
 * - 1 EvaluateScript event: 60ms (blocking)
 * - 2 EventDispatch events: "click" and "scroll"
 * - 1 MajorGC event (25ms)
 * - 1 MinorGC event (5ms)
 * - 1 Layout event (15ms)
 * - 1 Paint event (8ms)
 * - 2 events on secondary thread (should be filtered out)
 */
export function createTraceEventsFixture(): TraceEvent[] {
  return [
    // ── Metadata: identify main thread ──
    {
      cat: '__metadata',
      name: 'thread_name',
      ph: 'M',
      ts: 0,
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: { name: 'CrRendererMain' },
    },
    {
      cat: '__metadata',
      name: 'thread_name',
      ph: 'M',
      ts: 0,
      pid: 1,
      tid: SECONDARY_THREAD_ID,
      args: { name: 'CompositorThread' },
    },

    // ── Main thread events ──

    // FunctionCall: 80ms — BLOCKING (> 50ms threshold)
    {
      cat: 'devtools.timeline',
      name: 'FunctionCall',
      ph: 'X',
      ts: NAVIGATION_START_TS + 100_000, // 100ms after nav start
      dur: 80_000, // 80ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          functionName: 'initializeDataGrid',
          url: 'http://localhost:3000/app.js',
          lineNumber: 247,
          columnNumber: 12,
          stackTrace: [
            {
              functionName: 'initApp',
              url: 'http://localhost:3000/app.js',
              lineNumber: 100,
              columnNumber: 5,
            },
            {
              functionName: 'main',
              url: 'http://localhost:3000/app.js',
              lineNumber: 10,
              columnNumber: 1,
            },
          ],
        },
      },
    },

    // FunctionCall: 30ms — NOT blocking
    {
      cat: 'devtools.timeline',
      name: 'FunctionCall',
      ph: 'X',
      ts: NAVIGATION_START_TS + 200_000, // 200ms after nav start
      dur: 30_000, // 30ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          functionName: 'setupUI',
          url: 'http://localhost:3000/app.js',
          lineNumber: 300,
          columnNumber: 8,
        },
      },
    },

    // FunctionCall: 10ms — NOT blocking
    {
      cat: 'devtools.timeline',
      name: 'FunctionCall',
      ph: 'X',
      ts: NAVIGATION_START_TS + 250_000, // 250ms
      dur: 10_000, // 10ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          functionName: 'bindEvents',
          url: 'http://localhost:3000/app.js',
          lineNumber: 400,
          columnNumber: 3,
        },
      },
    },

    // EvaluateScript: 60ms — BLOCKING
    {
      cat: 'devtools.timeline',
      name: 'EvaluateScript',
      ph: 'X',
      ts: NAVIGATION_START_TS + 50_000, // 50ms after nav start
      dur: 60_000, // 60ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          functionName: '',
          url: 'http://localhost:3000/vendor.js',
          lineNumber: 1,
          columnNumber: 0,
        },
      },
    },

    // EventDispatch: "click"
    {
      cat: 'devtools.timeline',
      name: 'EventDispatch',
      ph: 'X',
      ts: NAVIGATION_START_TS + 500_000, // 500ms
      dur: 2_000, // 2ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          type: 'click',
          url: 'http://localhost:3000/app.js',
          lineNumber: 420,
        },
      },
    },

    // EventDispatch: "scroll"
    {
      cat: 'devtools.timeline',
      name: 'EventDispatch',
      ph: 'X',
      ts: NAVIGATION_START_TS + 510_000, // 510ms
      dur: 1_000, // 1ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          type: 'scroll',
          url: 'http://localhost:3000/components.js',
          lineNumber: 89,
        },
      },
    },

    // MajorGC: 25ms
    {
      cat: 'devtools.timeline',
      name: 'MajorGC',
      ph: 'X',
      ts: NAVIGATION_START_TS + 400_000, // 400ms
      dur: 25_000, // 25ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          usedHeapSizeBefore: 10_000_000,
          usedHeapSizeAfter: 6_000_000,
        },
      },
    },

    // MinorGC: 5ms
    {
      cat: 'devtools.timeline',
      name: 'MinorGC',
      ph: 'X',
      ts: NAVIGATION_START_TS + 350_000, // 350ms
      dur: 5_000, // 5ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {
        data: {
          usedHeapSizeBefore: 8_000_000,
          usedHeapSizeAfter: 7_500_000,
        },
      },
    },

    // Layout: 15ms
    {
      cat: 'devtools.timeline',
      name: 'Layout',
      ph: 'X',
      ts: NAVIGATION_START_TS + 300_000, // 300ms
      dur: 15_000, // 15ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {},
    },

    // Paint: 8ms
    {
      cat: 'devtools.timeline',
      name: 'Paint',
      ph: 'X',
      ts: NAVIGATION_START_TS + 320_000, // 320ms
      dur: 8_000, // 8ms
      pid: 1,
      tid: MAIN_THREAD_ID,
      args: {},
    },

    // ── Secondary thread events (should be filtered out) ──

    // FunctionCall on secondary thread: 100ms — would be blocking but wrong thread
    {
      cat: 'devtools.timeline',
      name: 'FunctionCall',
      ph: 'X',
      ts: NAVIGATION_START_TS + 150_000,
      dur: 100_000, // 100ms
      pid: 1,
      tid: SECONDARY_THREAD_ID,
      args: {
        data: {
          functionName: 'compositorWork',
          url: '',
          lineNumber: 0,
          columnNumber: 0,
        },
      },
    },

    // Paint on secondary thread
    {
      cat: 'devtools.timeline',
      name: 'Paint',
      ph: 'X',
      ts: NAVIGATION_START_TS + 280_000,
      dur: 3_000,
      pid: 1,
      tid: SECONDARY_THREAD_ID,
      args: {},
    },
  ];
}

/**
 * Create a trace fixture WITHOUT metadata events (for testing fallback thread detection).
 */
export function createTraceEventsWithoutMetadata(): TraceEvent[] {
  const events = createTraceEventsFixture().filter((e) => e.cat !== '__metadata');
  return events;
}
