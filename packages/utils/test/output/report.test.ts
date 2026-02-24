import { test, expect, describe } from 'bun:test';
import { generateMarkdown } from '../../src/output/report';
import type {
  Finding,
  HeapSummary,
  TraceResult,
  ScreencastFrame,
  RenderingDiagnostic,
} from '../../src/types';

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

function createScreencastFrame(timestamp: number, dataLength: number): ScreencastFrame {
  const fakeB64 = 'AAAA'.repeat(Math.max(1, Math.ceil(dataLength / 3)));
  return {
    timestamp,
    data: fakeB64,
    sessionId: 0,
    dataLength,
  };
}

function createRenderingDiagnostic(): RenderingDiagnostic {
  return {
    filmstrip: [
      { index: 0, timestamp: 0, dataLength: 50, isVisualChange: true },
      { index: 1, timestamp: 100, dataLength: 200, isVisualChange: true },
      { index: 2, timestamp: 200, dataLength: 500, isVisualChange: false },
      { index: 3, timestamp: 350, dataLength: 800, isVisualChange: true },
    ],
    visualChanges: [
      { timestamp: 0, frameIndex: 0, visualCompleteness: 6, changeMagnitude: 1 },
      { timestamp: 100, frameIndex: 1, visualCompleteness: 25, changeMagnitude: 0.75 },
      { timestamp: 350, frameIndex: 3, visualCompleteness: 100, changeMagnitude: 0.6 },
    ],
    fcpCorrelation: {
      fcpTimestamp: 350,
      nearestFrameIndex: 3,
      resourcesLoadedBeforeFCP: [],
      resourcesLoadingAtFCP: [],
      renderBlockingChain: [
        {
          url: 'http://localhost:3000/styles.css',
          resourceType: 'Stylesheet',
          duration: 80,
          size: 50000,
        },
      ],
      mainThreadBlockersBeforeFCP: [],
      totalBlockingTimeBeforeFCP: 0,
      layoutTimeBeforeFCP: 30,
    },
    renderingPhases: [
      {
        name: 'Server & Network',
        startTime: 0,
        endTime: 200,
        duration: 200,
        description: 'DNS + TCP + server response.',
      },
      {
        name: 'Navigation to FCP',
        startTime: 200,
        endTime: 350,
        duration: 150,
        description: 'Parsing and rendering.',
      },
    ],
    speedIndex: 280,
    fcpBottlenecks: [
      {
        type: 'render-blocking-resource',
        description: 'Render-blocking stylesheet (48.8KB) delayed FCP by ~80ms.',
        estimatedDelayMs: 80,
        source: 'http://localhost:3000/styles.css',
      },
    ],
  };
}

describe('generateMarkdown — with rendering filmstrip', () => {
  const trace = createTraceResult();
  trace.renderingDiagnostic = createRenderingDiagnostic();
  trace.screencastFrames = [
    createScreencastFrame(0, 50),
    createScreencastFrame(100, 200),
    createScreencastFrame(200, 500),
    createScreencastFrame(350, 800),
  ];

  const md = generateMarkdown({
    url: 'http://localhost:3000',
    version: '0.3.0',
    findings: createFindings(),
    heapSummary: createHeapSummary(),
    trace,
  });

  test('includes Rendering Filmstrip section', () => {
    expect(md).toContain('## Rendering Filmstrip');
  });

  test('includes Speed Index and FCP in filmstrip header', () => {
    expect(md).toContain('**Speed Index** 280ms');
    expect(md).toContain('**FCP** 350ms');
  });

  test('embeds base64 images in filmstrip table', () => {
    expect(md).toContain('data:image/jpeg;base64,');
    expect(md).toContain('<img src="data:image/jpeg;base64,');
  });

  test('includes timestamp labels for filmstrip frames', () => {
    expect(md).toContain('0ms');
    expect(md).toContain('350ms');
  });

  test('includes Visual Progress table', () => {
    expect(md).toContain('### Visual Progress');
    expect(md).toContain('Visual Completeness');
    expect(md).toContain('100%');
  });

  test('includes Rendering Phases table', () => {
    expect(md).toContain('### Rendering Phases');
    expect(md).toContain('Server & Network');
    expect(md).toContain('200ms');
  });

  test('includes FCP Bottlenecks table', () => {
    expect(md).toContain('### FCP Bottlenecks');
    expect(md).toContain('render blocking resource');
    expect(md).toContain('80ms');
  });

  test('filmstrip section appears before findings', () => {
    const filmstripIdx = md.indexOf('## Rendering Filmstrip');
    const findingsIdx = md.indexOf('## 🔴');
    expect(filmstripIdx).toBeGreaterThan(0);
    expect(findingsIdx).toBeGreaterThan(filmstripIdx);
  });
});

describe('generateMarkdown — without rendering diagnostic', () => {
  const md = generateMarkdown({
    url: 'http://localhost:3000',
    version: '0.3.0',
    findings: createFindings(),
    heapSummary: createHeapSummary(),
    trace: createTraceResult(),
  });

  test('does not include filmstrip section when no diagnostic data', () => {
    expect(md).not.toContain('## Rendering Filmstrip');
    expect(md).not.toContain('data:image/jpeg;base64,');
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
