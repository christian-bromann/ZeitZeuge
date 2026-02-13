import { test, expect, describe } from 'bun:test';
import { generateMarkdown } from '../../src/output/report';
import type { Finding, HeapSummary, TraceResult } from '../../src/types';

function createHeapSummary(): HeapSummary {
  return {
    metadata: {
      url: 'http://localhost:3000',
      capturedAt: Date.now(),
      totalSize: 5_000_000,
      nodeCount: 1200,
      edgeCount: 3400,
    },
    largestObjects: [
      {
        name: 'DataCache',
        type: 'object',
        selfSize: 1000,
        retainedSize: 4_000_000,
        retainerPath: ['Window', 'app', 'DataCache'],
      },
    ],
    typeStats: [{ type: 'object', count: 50, totalSize: 4_500_000, avgSize: 90_000 }],
    constructorStats: [{ constructor: 'Array', count: 10, totalSize: 3_000_000, avgSize: 300_000 }],
    detachedNodes: { count: 2, totalSize: 2048, examples: [] },
    closureStats: { count: 15, totalSize: 8000, topClosures: [] },
  };
}

function createTraceResult(): TraceResult {
  return {
    networkRequests: [
      {
        requestId: '1',
        url: 'http://localhost:3000/',
        method: 'GET',
        resourceType: 'Document',
        mimeType: 'text/html',
        status: 200,
        encodedSize: 5000,
        decodedSize: 12000,
        startTime: 0,
        endTime: 200,
        duration: 200,
        isRenderBlocking: false,
        responseBody: '<html></html>',
        priority: 'VeryHigh',
        initiator: 'other',
      },
      {
        requestId: '2',
        url: 'http://localhost:3000/vendor.js',
        method: 'GET',
        resourceType: 'Script',
        mimeType: 'application/javascript',
        status: 200,
        encodedSize: 120_000,
        decodedSize: 420_000,
        startTime: 100,
        endTime: 600,
        duration: 500,
        isRenderBlocking: true,
        responseBody: '// big bundle',
        priority: 'High',
        initiator: 'parser',
      },
    ],
    metrics: {
      navigationStart: 1000,
      domContentLoaded: 800,
      loadComplete: 2100,
      firstPaint: 300,
      firstContentfulPaint: 350,
      largestContentfulPaint: 0,
      totalBlockingTime: 290,
      longTasks: [{ startTime: 500, duration: 340, scriptUrl: null }],
    },
  };
}

function createFindings(): Finding[] {
  return [
    {
      severity: 'critical',
      title: 'initializeDataGrid() blocks main thread for 340ms',
      description:
        'This function processes 10,000 rows synchronously during page load, blocking the main thread for 340ms.',
      category: 'frame-blocking-function',
      resourceUrl: 'http://localhost:3000/app.js',
      workspacePath: '/scripts/app.js',
      impactMs: 340,
      suggestedFix:
        'async function initializeDataGrid(rows) {\n  const CHUNK = 100;\n  for (let i = 0; i < rows.length; i += CHUNK) {\n    processChunk(rows.slice(i, i + CHUNK));\n    await scheduler.yield();\n  }\n}',
    },
    {
      severity: 'warning',
      title: '847 "scroll" listeners registered, 0 removed',
      description:
        'addEventListener("scroll", handler) called in a loop without corresponding removeEventListener.',
      category: 'listener-leak',
      resourceUrl: 'http://localhost:3000/components.js',
      suggestedFix:
        'useEffect(() => {\n  window.addEventListener("scroll", handler);\n  return () => {\n    window.removeEventListener("scroll", handler);\n  };\n}, []);',
    },
    {
      severity: 'info',
      title: 'Unbounded cache in DataCache',
      description: 'DataCache.items array grows without eviction policy.',
      category: 'memory-leak',
      retainedSize: 4_000_000,
      retainerPath: ['Window', 'app', 'DataCache', 'items'],
      suggestedFix: 'Add a maximum cache size and LRU eviction.',
    },
  ];
}

describe('generateMarkdown', () => {
  const md = generateMarkdown({
    url: 'http://localhost:3000',
    version: '0.3.0',
    findings: createFindings(),
    heapSummary: createHeapSummary(),
    trace: createTraceResult(),
  });

  test('starts with a heading', () => {
    expect(md.startsWith('# Performance Report')).toBe(true);
  });

  test('includes the target URL in the header', () => {
    expect(md).toContain('http://localhost:3000');
  });

  test('includes the version', () => {
    expect(md).toContain('v0.3.0');
  });

  test('has a one-line health snapshot instead of metric tables', () => {
    // Key metrics on one line
    expect(md).toContain('**Page load**');
    expect(md).toContain('**FCP**');
    expect(md).toContain('**TBT**');
    expect(md).toContain('**Heap**');
    expect(md).toContain('requests');
    // Should NOT have detailed metric tables
    expect(md).not.toContain('| Metric | Value |');
    expect(md).not.toContain('Node count');
    expect(md).not.toContain('Edge count');
  });

  test('includes finding counts', () => {
    expect(md).toContain('1 critical');
    expect(md).toContain('1 warning');
    expect(md).toContain('1 info');
  });

  test('each finding has a heading with its title', () => {
    expect(md).toContain('## 🔴 initializeDataGrid() blocks main thread for 340ms');
    expect(md).toContain('## 🟡 847 "scroll" listeners registered, 0 removed');
    expect(md).toContain('## ℹ️ Unbounded cache in DataCache');
  });

  test('each finding shows its category and key metric inline', () => {
    expect(md).toContain('**Frame-Blocking Function** · 340ms impact');
    expect(md).toContain('**Listener Leak**');
    expect(md).toContain('**Memory Leak** · 3.8 MB retained');
  });

  test('renders code fixes in fenced code blocks', () => {
    expect(md).toContain('```js');
    expect(md).toContain('await scheduler.yield()');
    expect(md).toContain('removeEventListener');
  });

  test('renders plain-text fixes as regular text', () => {
    expect(md).toContain('Add a maximum cache size and LRU eviction.');
  });

  test("findings have a 'How to fix' section", () => {
    expect(md).toContain('### How to fix');
  });

  test('shows retention path when available', () => {
    expect(md).toContain('`Window` → `app` → `DataCache` → `items`');
  });

  test('does NOT include verbose data tables', () => {
    // No separate heap objects table, GC table, blocking functions table, etc.
    expect(md).not.toContain('Largest Heap Objects');
    expect(md).not.toContain('Garbage Collection Events');
    expect(md).not.toContain('Blocking Functions (> 50ms)');
    expect(md).not.toContain('Render-Blocking Resources');
    expect(md).not.toContain('Main Thread Time Breakdown');
  });

  test('includes footer', () => {
    expect(md).toContain('Generated by zeitzeuge');
  });
});

describe('generateMarkdown — no findings', () => {
  const md = generateMarkdown({
    url: 'http://localhost:3000',
    version: '0.3.0',
    findings: [],
    heapSummary: createHeapSummary(),
    trace: createTraceResult(),
  });

  test('shows healthy message when no findings', () => {
    expect(md).toContain('No issues found');
    expect(md).toContain('looking healthy');
  });

  test('still includes the health snapshot line', () => {
    expect(md).toContain('**Page load**');
  });
});
