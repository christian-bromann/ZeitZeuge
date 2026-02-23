import { test, expect, describe } from 'bun:test';
import { buildRenderingDiagnostic } from '../../src/browser/fcp-analysis';
import type { TraceResult, ScreencastFrame, NetworkRequest } from '@zeitzeuge/utils';
import { NAVIGATION_START_TS } from '../fixtures/trace-events';
import { createTraceEventsFixture } from '../fixtures/trace-events';
import { parseRuntimeTrace } from '../../src/browser/runtime-trace';

function createFrame(timestamp: number, dataLength: number): ScreencastFrame {
  return {
    timestamp,
    data: 'x'.repeat(Math.ceil(dataLength / 0.75)),
    sessionId: 0,
    dataLength,
  };
}

function createNetworkRequest(overrides: Partial<NetworkRequest> = {}): NetworkRequest {
  return {
    requestId: '1',
    url: 'http://localhost:3000/app.js',
    method: 'GET',
    resourceType: 'Script',
    mimeType: 'application/javascript',
    status: 200,
    encodedSize: 50000,
    decodedSize: 100000,
    startTime: 0,
    endTime: 100,
    duration: 100,
    isRenderBlocking: false,
    responseBody: null,
    priority: 'High',
    initiator: 'parser',
    ...overrides,
  };
}

function createTestTraceResult(): TraceResult {
  const rawTraceEvents = createTraceEventsFixture();
  const runtimeTrace = parseRuntimeTrace(rawTraceEvents, NAVIGATION_START_TS);

  return {
    networkRequests: [
      createNetworkRequest({
        requestId: 'doc',
        url: 'http://localhost:3000/',
        resourceType: 'Document',
        mimeType: 'text/html',
        startTime: 0,
        endTime: 50,
        duration: 50,
        isRenderBlocking: false,
      }),
      createNetworkRequest({
        requestId: 'css',
        url: 'http://localhost:3000/styles.css',
        resourceType: 'Stylesheet',
        startTime: 50,
        endTime: 120,
        duration: 70,
        isRenderBlocking: true,
        decodedSize: 80000,
      }),
      createNetworkRequest({
        requestId: 'js1',
        url: 'http://localhost:3000/vendor.js',
        resourceType: 'Script',
        startTime: 50,
        endTime: 150,
        duration: 100,
        isRenderBlocking: true,
        decodedSize: 200000,
      }),
      createNetworkRequest({
        requestId: 'js2',
        url: 'http://localhost:3000/app.js',
        resourceType: 'Script',
        startTime: 160,
        endTime: 250,
        duration: 90,
        isRenderBlocking: false,
      }),
      createNetworkRequest({
        requestId: 'img',
        url: 'http://localhost:3000/hero.jpg',
        resourceType: 'Image',
        startTime: 200,
        endTime: 400,
        duration: 200,
        isRenderBlocking: false,
      }),
    ],
    metrics: {
      navigationStart: 0,
      domContentLoaded: 300,
      loadComplete: 500,
      firstPaint: 130,
      firstContentfulPaint: 160,
      largestContentfulPaint: 400,
      totalBlockingTime: 90,
      longTasks: [{ startTime: 100, duration: 80, scriptUrl: 'http://localhost:3000/app.js' }],
    },
    runtimeTrace,
    rawTraceEvents,
  };
}

function createTestFrames(): ScreencastFrame[] {
  return [
    createFrame(0, 50),
    createFrame(50, 50),
    createFrame(100, 50),
    createFrame(130, 200),
    createFrame(160, 500),
    createFrame(200, 600),
    createFrame(300, 800),
    createFrame(500, 1000),
  ];
}

describe('buildRenderingDiagnostic', () => {
  const traceResult = createTestTraceResult();
  const frames = createTestFrames();
  const diagnostic = buildRenderingDiagnostic(traceResult, frames);

  test('produces a filmstrip with all frames', () => {
    expect(diagnostic.filmstrip.length).toBe(frames.length);
    expect(diagnostic.filmstrip[0].index).toBe(0);
    expect(diagnostic.filmstrip[diagnostic.filmstrip.length - 1].index).toBe(frames.length - 1);
  });

  test('detects visual changes', () => {
    expect(diagnostic.visualChanges.length).toBeGreaterThan(0);
  });

  test('computes speed index', () => {
    expect(diagnostic.speedIndex).toBeGreaterThanOrEqual(0);
  });

  test('fcp correlation has correct FCP timestamp', () => {
    expect(diagnostic.fcpCorrelation.fcpTimestamp).toBe(160);
  });

  test('fcp correlation identifies render-blocking chain', () => {
    const rbChain = diagnostic.fcpCorrelation.renderBlockingChain;
    expect(rbChain.length).toBeGreaterThan(0);
    const urls = rbChain.map((r) => r.url);
    expect(urls).toContain('http://localhost:3000/styles.css');
  });

  test('fcp correlation identifies resources loaded before FCP', () => {
    const loaded = diagnostic.fcpCorrelation.resourcesLoadedBeforeFCP;
    expect(loaded.length).toBeGreaterThan(0);
    const docLoaded = loaded.find((r) => r.resourceType === 'Document');
    expect(docLoaded).toBeDefined();
  });

  test('fcp correlation identifies resources still loading at FCP', () => {
    const loading = diagnostic.fcpCorrelation.resourcesLoadingAtFCP;
    const appJs = loading.find((r) => r.url.includes('app.js'));
    if (appJs) {
      expect(appJs.startTime).toBeLessThanOrEqual(160);
    }
  });

  test('identifies rendering phases', () => {
    expect(diagnostic.renderingPhases.length).toBeGreaterThan(0);
    const phaseNames = diagnostic.renderingPhases.map((p) => p.name);
    expect(
      phaseNames.some(
        (n) => n.includes('FCP') || n.includes('Network') || n.includes('Navigation'),
      ),
    ).toBe(true);
  });

  test('rendering phases have positive durations', () => {
    for (const phase of diagnostic.renderingPhases) {
      expect(phase.duration).toBeGreaterThanOrEqual(0);
    }
  });

  test('identifies FCP bottlenecks', () => {
    expect(diagnostic.fcpBottlenecks.length).toBeGreaterThan(0);
  });

  test('FCP bottlenecks include render-blocking resources', () => {
    const rbBottlenecks = diagnostic.fcpBottlenecks.filter(
      (b) => b.type === 'render-blocking-resource',
    );
    expect(rbBottlenecks.length).toBeGreaterThan(0);
  });

  test('FCP bottlenecks are sorted by estimated delay (largest first)', () => {
    for (let i = 1; i < diagnostic.fcpBottlenecks.length; i++) {
      expect(diagnostic.fcpBottlenecks[i].estimatedDelayMs).toBeLessThanOrEqual(
        diagnostic.fcpBottlenecks[i - 1].estimatedDelayMs,
      );
    }
  });
});

describe('buildRenderingDiagnostic with empty frames', () => {
  const traceResult = createTestTraceResult();

  test('handles empty frames gracefully', () => {
    const diagnostic = buildRenderingDiagnostic(traceResult, []);
    expect(diagnostic.filmstrip.length).toBe(0);
    expect(diagnostic.visualChanges.length).toBe(0);
    expect(diagnostic.speedIndex).toBe(0);
    expect(diagnostic.fcpCorrelation.nearestFrameIndex).toBe(0);
    expect(diagnostic.renderingPhases.length).toBeGreaterThan(0);
    expect(diagnostic.fcpBottlenecks.length).toBeGreaterThan(0);
  });
});

describe('buildRenderingDiagnostic with slow server', () => {
  test('detects slow server response as bottleneck', () => {
    const traceResult = createTestTraceResult();
    traceResult.networkRequests[0] = createNetworkRequest({
      requestId: 'doc',
      url: 'http://localhost:3000/',
      resourceType: 'Document',
      startTime: 0,
      endTime: 800,
      duration: 800,
    });

    const diagnostic = buildRenderingDiagnostic(traceResult, createTestFrames());
    const serverBottleneck = diagnostic.fcpBottlenecks.find(
      (b) => b.type === 'slow-server-response',
    );
    expect(serverBottleneck).toBeDefined();
    expect(serverBottleneck!.estimatedDelayMs).toBe(600);
  });
});
