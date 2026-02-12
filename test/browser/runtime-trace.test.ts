import { test, expect, describe } from "bun:test";
import {
  parseRuntimeTrace,
  findMainThread,
  extractBlockingFunctions,
  extractEventListenerInfo,
  buildFrameBreakdown,
  extractGCEvents,
  findFrequentEvents,
} from "../../src/browser/runtime-trace";
import {
  createTraceEventsFixture,
  createTraceEventsWithoutMetadata,
  NAVIGATION_START_TS,
  MAIN_THREAD_ID,
} from "../fixtures/trace-events";

describe("findMainThread", () => {
  test("finds main thread from metadata event", () => {
    const events = createTraceEventsFixture();
    const tid = findMainThread(events);
    expect(tid).toBe(MAIN_THREAD_ID);
  });

  test("falls back to FunctionCall count when no metadata", () => {
    const events = createTraceEventsWithoutMetadata();
    const tid = findMainThread(events);
    // Main thread (tid=1) has 3 FunctionCall events, secondary (tid=2) has 1
    expect(tid).toBe(MAIN_THREAD_ID);
  });

  test("returns 0 for empty events array", () => {
    expect(findMainThread([])).toBe(0);
  });
});

describe("extractBlockingFunctions", () => {
  const events = createTraceEventsFixture();
  const mainEvents = events.filter((e) => e.tid === MAIN_THREAD_ID);
  const blocking = extractBlockingFunctions(mainEvents, NAVIGATION_START_TS);

  test("finds the 80ms FunctionCall and 60ms EvaluateScript", () => {
    expect(blocking.length).toBe(2);
  });

  test("excludes 30ms and 10ms calls (below 50ms threshold)", () => {
    const names = blocking.map((b) => b.functionName);
    expect(names).not.toContain("setupUI");
    expect(names).not.toContain("bindEvents");
  });

  test("sorted by duration descending (80ms first)", () => {
    expect(blocking[0].duration).toBe(80);
    expect(blocking[1].duration).toBe(60);
  });

  test("extracts function attribution correctly", () => {
    const initGrid = blocking.find(
      (b) => b.functionName === "initializeDataGrid"
    )!;
    expect(initGrid.scriptUrl).toBe("http://localhost:3000/app.js");
    expect(initGrid.lineNumber).toBe(247);
    expect(initGrid.columnNumber).toBe(12);
  });

  test("extracts call stack", () => {
    const initGrid = blocking.find(
      (b) => b.functionName === "initializeDataGrid"
    )!;
    expect(initGrid.callStack.length).toBe(2);
    expect(initGrid.callStack[0].functionName).toBe("initApp");
    expect(initGrid.callStack[1].functionName).toBe("main");
  });

  test("converts timestamps to ms relative to navigationStart", () => {
    const initGrid = blocking.find(
      (b) => b.functionName === "initializeDataGrid"
    )!;
    // Event ts = NAVIGATION_START_TS + 100_000 → relative = 100ms
    expect(initGrid.startTime).toBe(100);
  });

  test("all blocking functions have category 'scripting'", () => {
    expect(blocking.every((b) => b.category === "scripting")).toBe(true);
  });
});

describe("extractEventListenerInfo", () => {
  const events = createTraceEventsFixture();
  const mainEvents = events.filter((e) => e.tid === MAIN_THREAD_ID);
  const listeners = extractEventListenerInfo(mainEvents);

  test("groups click and scroll events from fixture", () => {
    expect(listeners.length).toBe(2);
    const types = listeners.map((l) => l.eventType);
    expect(types).toContain("click");
    expect(types).toContain("scroll");
  });

  test("correct dispatch counts", () => {
    const click = listeners.find((l) => l.eventType === "click")!;
    expect(click.addCount).toBe(1);
    const scroll = listeners.find((l) => l.eventType === "scroll")!;
    expect(scroll.addCount).toBe(1);
  });

  test("source locations extracted", () => {
    const click = listeners.find((l) => l.eventType === "click")!;
    expect(click.sources.length).toBe(1);
    expect(click.sources[0].scriptUrl).toBe("http://localhost:3000/app.js");
    expect(click.sources[0].lineNumber).toBe(420);
  });
});

describe("buildFrameBreakdown", () => {
  const events = createTraceEventsFixture();
  const mainEvents = events.filter((e) => e.tid === MAIN_THREAD_ID);
  const breakdown = buildFrameBreakdown(mainEvents);

  test("scripting time includes FunctionCall + EvaluateScript", () => {
    // 80ms + 30ms + 10ms + 60ms = 180ms
    expect(breakdown.scripting).toBe(180);
  });

  test("layout time from Layout events", () => {
    // 15ms
    expect(breakdown.layout).toBe(15);
  });

  test("painting time from Paint events", () => {
    // 8ms
    expect(breakdown.painting).toBe(8);
  });

  test("gc time from MajorGC + MinorGC", () => {
    // 25ms + 5ms = 30ms
    expect(breakdown.gc).toBe(30);
  });

  test("totalTime sums all categories", () => {
    expect(breakdown.totalTime).toBe(
      breakdown.scripting +
        breakdown.layout +
        breakdown.painting +
        breakdown.gc +
        breakdown.other
    );
  });

  test("does not include secondary thread events", () => {
    // If secondary thread were included, scripting would be 180+100=280
    expect(breakdown.scripting).toBe(180);
  });
});

describe("extractGCEvents", () => {
  const events = createTraceEventsFixture();
  const mainEvents = events.filter((e) => e.tid === MAIN_THREAD_ID);
  const gcEvents = extractGCEvents(mainEvents, NAVIGATION_START_TS);

  test("extracts both MajorGC and MinorGC", () => {
    expect(gcEvents.length).toBe(2);
    const types = gcEvents.map((g) => g.type);
    expect(types).toContain("MajorGC");
    expect(types).toContain("MinorGC");
  });

  test("sorted by start time", () => {
    // MinorGC at 350ms, MajorGC at 400ms
    expect(gcEvents[0].type).toBe("MinorGC");
    expect(gcEvents[1].type).toBe("MajorGC");
  });

  test("MajorGC has correct duration and heap sizes", () => {
    const major = gcEvents.find((g) => g.type === "MajorGC")!;
    expect(major.duration).toBe(25);
    expect(major.usedHeapSizeBefore).toBe(10_000_000);
    expect(major.usedHeapSizeAfter).toBe(6_000_000);
  });

  test("MinorGC has correct duration", () => {
    const minor = gcEvents.find((g) => g.type === "MinorGC")!;
    expect(minor.duration).toBe(5);
  });
});

describe("findFrequentEvents", () => {
  test("returns empty for fixture (only 1 click, 1 scroll — below threshold)", () => {
    const events = createTraceEventsFixture();
    const mainEvents = events.filter((e) => e.tid === MAIN_THREAD_ID);
    const frequent = findFrequentEvents(mainEvents);
    expect(frequent.length).toBe(0);
  });

  test("detects frequent events above threshold", () => {
    // Create events with 15 scroll dispatches
    const events: any[] = [];
    for (let i = 0; i < 15; i++) {
      events.push({
        cat: "devtools.timeline",
        name: "EventDispatch",
        ph: "X",
        ts: 1_000_000 + i * 1_000,
        dur: 500,
        pid: 1,
        tid: 1,
        args: { data: { type: "scroll" } },
      });
    }
    const frequent = findFrequentEvents(events);
    expect(frequent.length).toBe(1);
    expect(frequent[0].eventType).toBe("scroll");
    expect(frequent[0].count).toBe(15);
  });
});

describe("parseRuntimeTrace (integration)", () => {
  const events = createTraceEventsFixture();
  const summary = parseRuntimeTrace(events, NAVIGATION_START_TS);

  test("returns correct total event count", () => {
    expect(summary.totalEvents).toBe(events.length);
  });

  test("identifies main thread correctly", () => {
    expect(summary.mainThreadId).toBe(MAIN_THREAD_ID);
  });

  test("traceDuration is positive", () => {
    expect(summary.traceDuration).toBeGreaterThan(0);
  });

  test("blocking functions present", () => {
    expect(summary.blockingFunctions.length).toBe(2);
  });

  test("GC events present", () => {
    expect(summary.gcEvents.length).toBe(2);
  });

  test("frame breakdown has data", () => {
    expect(summary.frameBreakdown.totalTime).toBeGreaterThan(0);
  });

  test("event listeners detected", () => {
    expect(summary.eventListeners.length).toBe(2);
  });

  test("handles empty events array", () => {
    const empty = parseRuntimeTrace([], 0);
    expect(empty.totalEvents).toBe(0);
    expect(empty.mainThreadId).toBe(0);
    expect(empty.blockingFunctions.length).toBe(0);
  });
});
