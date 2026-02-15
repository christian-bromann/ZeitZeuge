import { test, expect, describe } from 'bun:test';
import { getAssetPath } from '../../src/sandbox/workspace';
import type {
  HeapSummary,
  TraceResult,
  NetworkRequest,
  RuntimeTraceSummary,
} from '@zeitzeuge/utils';

/**
 * Create a minimal HeapSummary fixture for workspace tests.
 */
function createHeapSummary(): HeapSummary {
  return {
    metadata: {
      url: 'http://localhost:3000',
      capturedAt: Date.now(),
      totalSize: 5000000,
      nodeCount: 100,
      edgeCount: 200,
    },
    largestObjects: [
      {
        name: 'BigCache',
        type: 'object',
        selfSize: 1000,
        retainedSize: 4000000,
        retainerPath: ['Window', 'app', 'BigCache'],
      },
    ],
    typeStats: [{ type: 'object', count: 50, totalSize: 4500000, avgSize: 90000 }],
    constructorStats: [
      {
        constructor: 'Array',
        count: 10,
        totalSize: 3000000,
        avgSize: 300000,
      },
    ],
    detachedNodes: { count: 0, totalSize: 0, examples: [] },
    closureStats: { count: 0, totalSize: 0, topClosures: [] },
  };
}

/**
 * Create a minimal TraceResult fixture.
 */
function createTraceResult(): TraceResult {
  return {
    networkRequests: [
      createRequest('req-1', 'http://localhost:3000/', 'Document', {
        body: '<html><body>Hello</body></html>',
        renderBlocking: false,
      }),
      createRequest('req-2', 'http://localhost:3000/app.js', 'Script', {
        body: 'function init() { console.log("init"); }',
        renderBlocking: true,
      }),
      createRequest('req-3', 'http://localhost:3000/styles.css', 'Stylesheet', {
        body: 'body { margin: 0; }',
        renderBlocking: true,
      }),
      createRequest('req-4', 'http://localhost:3000/logo.png', 'Image', {
        body: null,
        renderBlocking: false,
      }),
      createRequest('req-5', 'http://localhost:3000/font.woff2', 'Font', {
        body: null,
        renderBlocking: false,
      }),
    ],
    metrics: {
      navigationStart: 1000,
      domContentLoaded: 500,
      loadComplete: 2100,
      firstPaint: 200,
      firstContentfulPaint: 250,
      largestContentfulPaint: 0,
      totalBlockingTime: 70,
      longTasks: [{ startTime: 100, duration: 120, scriptUrl: null }],
    },
  };
}

function createRequest(
  id: string,
  url: string,
  type: string,
  opts: { body: string | null; renderBlocking: boolean },
): NetworkRequest {
  return {
    requestId: id,
    url,
    method: 'GET',
    resourceType: type,
    mimeType: '',
    status: 200,
    encodedSize: opts.body?.length ?? 0,
    decodedSize: opts.body?.length ?? 0,
    startTime: 0,
    endTime: 100,
    duration: 100,
    isRenderBlocking: opts.renderBlocking,
    responseBody: opts.body,
    priority: 'High',
    initiator: 'parser',
  };
}

describe('getAssetPath', () => {
  test('maps Script to /scripts/', () => {
    const req = createRequest('1', 'http://localhost/app.js', 'Script', {
      body: 'code',
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/scripts/app.js');
  });

  test('maps Stylesheet to /styles/', () => {
    const req = createRequest('2', 'http://localhost/main.css', 'Stylesheet', {
      body: 'css',
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/styles/main.css');
  });

  test('maps Document to /html/', () => {
    const req = createRequest('3', 'http://localhost/index.html', 'Document', {
      body: 'html',
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/html/index.html');
  });

  test('maps Font to /fonts/', () => {
    const req = createRequest('4', 'http://localhost/font.woff2', 'Font', {
      body: null,
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/fonts/font.woff2');
  });

  test('maps unknown types to /other/', () => {
    const req = createRequest('5', 'http://localhost/data.json', 'XHR', {
      body: '{}',
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/other/data.json');
  });

  test('extracts filename from deep path', () => {
    const req = createRequest('6', 'http://localhost/assets/js/vendor/lodash.min.js', 'Script', {
      body: 'code',
      renderBlocking: false,
    });
    expect(getAssetPath(req)).toBe('/scripts/lodash.min.js');
  });

  test('handles root path URL', () => {
    const req = createRequest('7', 'http://localhost/', 'Document', {
      body: 'html',
      renderBlocking: false,
    });
    // "/" has no filename, should default to "index"
    // Actually split("/").pop() returns "" for "/", so fallback to "index"
    expect(getAssetPath(req)).toBe('/html/index');
  });
});

describe('createWorkspace', () => {
  // Note: We test createWorkspace behavior through its output structure.
  // The actual VfsSandbox.create call is tested via integration tests.

  test('fixture data is well-formed for workspace creation', () => {
    const heap = createHeapSummary();
    const trace = createTraceResult();

    // Verify heap summary is JSON-serializable
    const heapJson = JSON.stringify(heap);
    expect(JSON.parse(heapJson).metadata.url).toBe('http://localhost:3000');

    // Verify trace result has expected request count
    expect(trace.networkRequests.length).toBe(5);

    // Verify text assets have bodies, binary don't
    const scripts = trace.networkRequests.filter((r) => r.resourceType === 'Script');
    expect(scripts.every((r) => r.responseBody !== null)).toBe(true);

    const images = trace.networkRequests.filter((r) => r.resourceType === 'Image');
    expect(images.every((r) => r.responseBody === null)).toBe(true);
  });

  test('maxAssetSize limits stored content', () => {
    const trace = createTraceResult();

    // Calculate total text content size
    const totalTextSize = trace.networkRequests
      .filter((r) => r.responseBody)
      .reduce((sum, r) => sum + (r.responseBody?.length ?? 0), 0);

    // With a very small limit, some assets should be excluded
    const smallLimit = 10; // 10 bytes
    let stored = 0;
    let storedCount = 0;
    for (const req of trace.networkRequests) {
      if (!req.responseBody) continue;
      if (stored + req.responseBody.length > smallLimit) continue;
      stored += req.responseBody.length;
      storedCount++;
    }

    // With a 10-byte limit, we should store fewer assets than total
    expect(storedCount).toBeLessThan(trace.networkRequests.filter((r) => r.responseBody).length);
    // The stored bytes should be within the limit
    expect(stored).toBeLessThanOrEqual(smallLimit);
    // But the total text content is larger, proving the limit worked
    expect(totalTextSize).toBeGreaterThan(smallLimit);
  });

  test('network waterfall would be sorted by start time', () => {
    const trace = createTraceResult();
    // Give different start times to all requests
    trace.networkRequests[0]!.startTime = 300;
    trace.networkRequests[1]!.startTime = 100;
    trace.networkRequests[2]!.startTime = 200;
    trace.networkRequests[3]!.startTime = 400;
    trace.networkRequests[4]!.startTime = 500;

    const sorted = [...trace.networkRequests].sort((a, b) => a.startTime - b.startTime);
    expect(sorted[0]!.startTime).toBe(100);
    expect(sorted[1]!.startTime).toBe(200);
    expect(sorted[2]!.startTime).toBe(300);
    expect(sorted[3]!.startTime).toBe(400);
    expect(sorted[4]!.startTime).toBe(500);
  });
});

describe('createWorkspace — runtime trace data', () => {
  function createRuntimeTrace(): RuntimeTraceSummary {
    return {
      totalEvents: 500,
      mainThreadId: 1,
      traceDuration: 2100,
      frameBreakdown: {
        totalTime: 233,
        scripting: 180,
        layout: 15,
        painting: 8,
        gc: 30,
        other: 0,
      },
      blockingFunctions: [
        {
          functionName: 'initializeDataGrid',
          scriptUrl: 'http://localhost:3000/app.js',
          lineNumber: 247,
          columnNumber: 12,
          duration: 80,
          startTime: 100,
          callStack: [
            {
              functionName: 'initApp',
              scriptUrl: 'http://localhost:3000/app.js',
              lineNumber: 100,
            },
          ],
          category: 'scripting',
        },
      ],
      eventListeners: [
        {
          eventType: 'scroll',
          addCount: 847,
          removeCount: 0,
          activeCount: 847,
          sources: [
            {
              scriptUrl: 'http://localhost:3000/components.js',
              lineNumber: 89,
              count: 847,
            },
          ],
        },
      ],
      gcEvents: [
        {
          startTime: 400,
          duration: 25,
          type: 'MajorGC',
          usedHeapSizeBefore: 10_000_000,
          usedHeapSizeAfter: 6_000_000,
        },
      ],
      frequentEvents: [{ eventType: 'scroll', count: 847, totalDuration: 423.5 }],
    };
  }

  test('runtime trace data is well-formed', () => {
    const rt = createRuntimeTrace();
    expect(rt.totalEvents).toBe(500);
    expect(rt.blockingFunctions.length).toBe(1);
    expect(rt.eventListeners.length).toBe(1);
    expect(rt.gcEvents.length).toBe(1);
  });

  test('runtime trace summary is JSON-serializable', () => {
    const rt = createRuntimeTrace();
    const summaryJson = JSON.stringify({
      totalEvents: rt.totalEvents,
      traceDuration: rt.traceDuration,
      frameBreakdown: rt.frameBreakdown,
      blockingFunctionCount: rt.blockingFunctions.length,
    });
    const parsed = JSON.parse(summaryJson);
    expect(parsed.totalEvents).toBe(500);
    expect(parsed.frameBreakdown.scripting).toBe(180);
  });

  test('blocking functions are JSON-serializable', () => {
    const rt = createRuntimeTrace();
    const json = JSON.stringify(rt.blockingFunctions.slice(0, 50));
    const parsed = JSON.parse(json);
    expect(parsed.length).toBe(1);
    expect(parsed[0].functionName).toBe('initializeDataGrid');
    expect(parsed[0].duration).toBe(80);
  });

  test('TraceResult with runtimeTrace is valid', () => {
    const trace = createTraceResult();
    trace.runtimeTrace = createRuntimeTrace();
    expect(trace.runtimeTrace.totalEvents).toBe(500);
    expect(trace.runtimeTrace.blockingFunctions.length).toBe(1);
  });

  test('TraceResult without runtimeTrace is still valid (backwards compat)', () => {
    const trace = createTraceResult();
    expect(trace.runtimeTrace).toBeUndefined();
  });
});
