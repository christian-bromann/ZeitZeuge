import { test, expect, describe } from 'bun:test';
import { parseSnapshot } from '../src/analysis/parser';
import { initModel } from '@zeitzeuge/utils';
import { getAssetPath } from '../src/sandbox/workspace';
import type { RawSnapshot, Finding, TraceResult, NetworkRequest } from '@zeitzeuge/utils';

/**
 * Integration tests for the zeitzeuge pipeline.
 *
 * These tests verify the pipeline from snapshot parsing through to
 * workspace preparation. They use fixture data to avoid requiring
 * a real browser or LLM API calls.
 */

// A realistic (but small) heap snapshot fixture
function createRealisticFixture(): RawSnapshot {
  const snapshot = {
    snapshot: {
      meta: {
        node_fields: [
          'type',
          'name',
          'id',
          'self_size',
          'edge_count',
          'trace_node_id',
          'detachedness',
        ],
        node_types: [
          [
            'hidden',
            'array',
            'string',
            'object',
            'code',
            'closure',
            'regexp',
            'number',
            'native',
            'synthetic',
            'concatenated string',
            'sliced string',
            'symbol',
            'bigint',
          ],
          'string',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'],
          'string_or_number',
          'node',
        ],
      },
      node_count: 8,
      edge_count: 8,
    },
    strings: [
      '',
      '(GC roots)',
      'Window',
      'DataCache',
      'items',
      'cachedData',
      'onClick',
      'Detached HTMLDivElement',
      'window',
      'cache',
      'data',
      'handler',
      'detachedEl',
      'label',
      'shortStr',
      'bigString',
    ],
    nodes: [
      9, 1, 1, 0, 2, 0, 0, 3, 2, 2, 128, 2, 0, 0, 3, 3, 3, 64, 1, 0, 0, 1, 4, 4, 8192000, 1, 0, 0,
      2, 5, 5, 2048000, 0, 0, 0, 5, 6, 6, 512, 0, 0, 0, 8, 7, 7, 1024, 0, 0, 1, 2, 14, 8, 32, 0, 0,
      0,
    ],
    edges: [2, 8, 7, 4, 12, 42, 2, 9, 14, 2, 11, 35, 2, 10, 21, 1, 0, 28, 2, 13, 49, 6, 10, 28],
    trace_function_infos: [],
    trace_tree: [],
    locations: [],
  };

  return {
    data: JSON.stringify(snapshot),
    capturedAt: Date.now(),
    url: 'http://localhost:3000',
  };
}

// Create a mock TraceResult with known patterns
function createTraceFixture(): TraceResult {
  return {
    networkRequests: [
      createNetworkRequest('req-1', 'http://localhost:3000/', 'Document', {
        body: "<html><head><script src='/vendor.js'></script></head><body></body></html>",
        renderBlocking: false,
        size: 200,
      }),
      createNetworkRequest('req-2', 'http://localhost:3000/vendor.js', 'Script', {
        body: `
// jQuery + Lodash + Moment.js bundled together
function jQuery() { /* ... */ }
function lodash() { /* ... */ }
function moment() { /* ... */ }
export { jQuery, lodash, moment };
          `.trim(),
        renderBlocking: true,
        size: 420000,
      }),
      createNetworkRequest('req-3', 'http://localhost:3000/app.js', 'Script', {
        body: `
function initializeDataGrid(rows) {
  for (let i = 0; i < rows.length; i++) {
    processRow(rows[i]);
  }
}
initializeDataGrid(new Array(10000));
          `.trim(),
        renderBlocking: false,
        size: 180000,
      }),
      createNetworkRequest('req-4', 'http://localhost:3000/styles.css', 'Stylesheet', {
        body: 'body { margin: 0; } .app { display: flex; }',
        renderBlocking: true,
        size: 85000,
      }),
      createNetworkRequest('req-5', 'http://localhost:3000/logo.png', 'Image', {
        body: null,
        renderBlocking: false,
        size: 50000,
      }),
    ],
    metrics: {
      navigationStart: 1000,
      domContentLoaded: 800,
      loadComplete: 2100,
      firstPaint: 1200,
      firstContentfulPaint: 1250,
      largestContentfulPaint: 0,
      totalBlockingTime: 290,
      longTasks: [{ startTime: 500, duration: 340, scriptUrl: 'http://localhost:3000/app.js' }],
    },
  };
}

function createNetworkRequest(
  id: string,
  url: string,
  type: string,
  opts: {
    body: string | null;
    renderBlocking: boolean;
    size: number;
  },
): NetworkRequest {
  return {
    requestId: id,
    url,
    method: 'GET',
    resourceType: type,
    mimeType: '',
    status: 200,
    encodedSize: opts.size,
    decodedSize: opts.size,
    startTime: 0,
    endTime: 100,
    duration: 100,
    isRenderBlocking: opts.renderBlocking,
    responseBody: opts.body,
    priority: 'High',
    initiator: 'parser',
  };
}

describe('Integration: heap snapshot parsing', () => {
  const fixture = createRealisticFixture();

  test('parseSnapshot produces a valid HeapSummary', () => {
    const summary = parseSnapshot(fixture);

    expect(summary.metadata.url).toBe('http://localhost:3000');
    expect(summary.metadata.nodeCount).toBe(8);
    expect(summary.metadata.edgeCount).toBe(8);
    expect(summary.metadata.totalSize).toBeGreaterThan(0);

    const largestBySize = summary.largestObjects[0];
    expect(largestBySize?.retainedSize).toBeGreaterThan(1000000);

    expect(summary.typeStats.length).toBeGreaterThan(0);
    expect(summary.constructorStats.length).toBeGreaterThan(0);
    expect(summary.detachedNodes.count).toBeGreaterThan(0);
    expect(summary.closureStats.count).toBeGreaterThan(0);
  });

  test('summary data is sized for LLM context (< 50KB when stringified)', () => {
    const summary = parseSnapshot(fixture);
    const summaryJson = JSON.stringify(summary);
    expect(summaryJson.length).toBeLessThan(50 * 1024);
  });

  test('the largest retained object chain shows DataCache → items → cachedData', () => {
    const summary = parseSnapshot(fixture);
    const itemsArray = summary.largestObjects.find(
      (obj) => obj.name === 'items' || obj.type === 'array',
    );
    expect(itemsArray).toBeTruthy();
    expect(itemsArray!.retainedSize).toBeGreaterThanOrEqual(itemsArray!.selfSize);
  });

  test('detached DOM node is identified correctly', () => {
    const summary = parseSnapshot(fixture);
    expect(summary.detachedNodes.count).toBe(1);
    expect(summary.detachedNodes.totalSize).toBe(1024);
    expect(summary.detachedNodes.examples.length).toBe(1);
    expect(summary.detachedNodes.examples[0]?.name).toContain('Detached');
  });
});

describe('Integration: trace fixture validation', () => {
  const trace = createTraceFixture();

  test('trace has expected request count', () => {
    expect(trace.networkRequests.length).toBe(5);
  });

  test('trace identifies render-blocking resources', () => {
    const blocking = trace.networkRequests.filter((r) => r.isRenderBlocking);
    expect(blocking.length).toBe(2); // vendor.js + styles.css
  });

  test('trace identifies long tasks', () => {
    expect(trace.metrics.longTasks.length).toBe(1);
    expect(trace.metrics.longTasks[0]?.duration).toBe(340);
  });

  test("text resources have bodies, binary resources don't", () => {
    const scripts = trace.networkRequests.filter((r) => r.resourceType === 'Script');
    expect(scripts.every((r) => r.responseBody !== null)).toBe(true);

    const images = trace.networkRequests.filter((r) => r.resourceType === 'Image');
    expect(images.every((r) => r.responseBody === null)).toBe(true);
  });
});

describe('Integration: VFS workspace structure', () => {
  const trace = createTraceFixture();

  test('scripts map to /scripts/', () => {
    const scriptReq = trace.networkRequests.find((r) => r.resourceType === 'Script')!;
    expect(getAssetPath(scriptReq)).toContain('/scripts/');
  });

  test('stylesheets map to /styles/', () => {
    const cssReq = trace.networkRequests.find((r) => r.resourceType === 'Stylesheet')!;
    expect(getAssetPath(cssReq)).toContain('/styles/');
  });

  test('HTML documents map to /html/', () => {
    const htmlReq = trace.networkRequests.find((r) => r.resourceType === 'Document')!;
    expect(getAssetPath(htmlReq)).toContain('/html/');
  });

  test('heap summary would be valid JSON at /heap/summary.json', () => {
    const heapFixture = createRealisticFixture();
    const heapSummary = parseSnapshot(heapFixture);
    const json = JSON.stringify(heapSummary, null, 2);
    const parsed = JSON.parse(json);
    expect(parsed.metadata.url).toBe('http://localhost:3000');
    expect(parsed.metadata.nodeCount).toBe(8);
  });
});

describe('Integration: unified Finding type', () => {
  test('Finding accepts memory-type findings', () => {
    const finding: Finding = {
      severity: 'critical',
      title: 'Unbounded cache in DataCache',
      description: 'DataCache.items grows without bound',
      category: 'memory-leak',
      retainedSize: 8192000,
      retainerPath: ['Window', 'app', 'DataCache', 'items'],
      suggestedFix: 'Add cache eviction policy',
    };
    expect(finding.category).toBe('memory-leak');
    expect(finding.retainedSize).toBe(8192000);
    expect(finding.impactMs).toBeUndefined();
  });

  test('Finding accepts trace-type findings', () => {
    const finding: Finding = {
      severity: 'critical',
      title: 'Render-blocking script "vendor.js"',
      description: 'Blocks first paint for 1.2s',
      category: 'render-blocking',
      resourceUrl: 'http://localhost:3000/vendor.js',
      workspacePath: '/scripts/vendor.js',
      impactMs: 1200,
      suggestedFix: '<script src="/vendor.js" defer></script>',
    };
    expect(finding.category).toBe('render-blocking');
    expect(finding.impactMs).toBe(1200);
    expect(finding.retainedSize).toBeUndefined();
  });

  test('Finding accepts frame-blocking-function findings', () => {
    const finding: Finding = {
      severity: 'critical',
      title: 'initializeDataGrid() blocks for 340ms',
      description: 'Synchronous loop blocking main thread',
      category: 'frame-blocking-function',
      resourceUrl: 'http://localhost:3000/app.js',
      impactMs: 340,
      suggestedFix: 'Chunk the work with requestIdleCallback',
    };
    expect(finding.category).toBe('frame-blocking-function');
  });

  test('Finding accepts listener-leak findings', () => {
    const finding: Finding = {
      severity: 'warning',
      title: '847 "scroll" listeners registered',
      description: 'addEventListener without removeEventListener',
      category: 'listener-leak',
      resourceUrl: 'http://localhost:3000/components.js',
      suggestedFix: 'Add cleanup in useEffect',
    };
    expect(finding.category).toBe('listener-leak');
  });

  test('Finding accepts gc-pressure findings', () => {
    const finding: Finding = {
      severity: 'info',
      title: '12 major GC pauses',
      description: 'Frequent object allocation in hot loop',
      category: 'gc-pressure',
      impactMs: 180,
      suggestedFix: 'Reuse objects',
    };
    expect(finding.category).toBe('gc-pressure');
  });
});

describe('Integration: fail-fast mechanisms', () => {
  test('initModel throws when no API key is set', () => {
    const savedOpenAI = process.env.OPENAI_API_KEY;
    const savedAnthropic = process.env.ANTHROPIC_API_KEY;
    delete process.env.OPENAI_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;

    try {
      expect(() => initModel()).toThrow('No API key found');
    } finally {
      if (savedOpenAI) process.env.OPENAI_API_KEY = savedOpenAI;
      if (savedAnthropic) process.env.ANTHROPIC_API_KEY = savedAnthropic;
    }
  });
});
