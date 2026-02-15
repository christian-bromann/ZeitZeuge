import { test, expect, describe, beforeEach } from 'bun:test';
import { tracePageLoad } from '../../src/browser/trace';
import type { TraceHandle } from '@zeitzeuge/utils';

/**
 * Mock CDP session that records all calls and allows triggering events.
 */
function createMockCdpSession(opts?: { tracingStartFails?: boolean }) {
  const listeners = new Map<string, Function[]>();
  const calls: Array<{ method: string; params?: any }> = [];

  return {
    calls,
    send(method: string, params?: any) {
      calls.push({ method, params });

      // Simulate Tracing.start failure if configured
      if (method === 'Tracing.start' && opts?.tracingStartFails) {
        return Promise.reject(new Error('Tracing not supported'));
      }

      // When Tracing.end is called, simulate flushing trace data and completing
      if (method === 'Tracing.end') {
        // Simulate Tracing.dataCollected with some events
        setTimeout(() => {
          const handlers = listeners.get('Tracing.dataCollected') || [];
          for (const handler of handlers) {
            handler({
              value: [
                {
                  cat: '__metadata',
                  name: 'thread_name',
                  ph: 'M',
                  ts: 0,
                  pid: 1,
                  tid: 1,
                  args: { name: 'CrRendererMain' },
                },
                {
                  cat: 'devtools.timeline',
                  name: 'FunctionCall',
                  ph: 'X',
                  ts: 100_000,
                  dur: 80_000,
                  pid: 1,
                  tid: 1,
                  args: {
                    data: {
                      functionName: 'init',
                      url: 'http://localhost/app.js',
                      lineNumber: 10,
                      columnNumber: 0,
                    },
                  },
                },
              ],
            });
          }
          // Then fire tracingComplete
          const completeHandlers = listeners.get('Tracing.tracingComplete') || [];
          for (const handler of completeHandlers) handler({});
        }, 5);
        return Promise.resolve();
      }

      // Return mock response bodies when requested
      if (method === 'Network.getResponseBody') {
        const requestId = params?.requestId;
        if (requestId === 'req-script') {
          return Promise.resolve({ body: 'console.log("hello");' });
        }
        if (requestId === 'req-css') {
          return Promise.resolve({ body: 'body { color: red; }' });
        }
        if (requestId === 'req-html') {
          return Promise.resolve({
            body: '<html><head></head><body></body></html>',
          });
        }
        if (requestId === 'req-image') {
          return Promise.resolve({ body: null });
        }
        if (requestId === 'req-large') {
          return Promise.resolve({ body: 'x'.repeat(3 * 1024 * 1024) });
        }
        return Promise.reject(new Error('No body available'));
      }

      // Return mock Runtime.evaluate results
      if (method === 'Runtime.evaluate') {
        if (params?.expression?.includes('__zeitzeuge_longTasks')) {
          return Promise.resolve({
            result: {
              value: JSON.stringify([{ startTime: 100, duration: 120, scriptUrl: null }]),
            },
          });
        }
        if (params?.expression?.includes('performance.timing')) {
          return Promise.resolve({
            result: {
              value: JSON.stringify({
                navigationStart: 1000,
                domContentLoaded: 500,
                loadComplete: 2100,
              }),
            },
          });
        }
        if (params?.expression?.includes('getEntriesByType')) {
          return Promise.resolve({
            result: {
              value: JSON.stringify([
                { name: 'first-paint', startTime: 200 },
                { name: 'first-contentful-paint', startTime: 250 },
              ]),
            },
          });
        }
        return Promise.resolve({ result: { value: '{}' } });
      }

      return Promise.resolve();
    },
    on(event: string, handler: Function) {
      if (!listeners.has(event)) listeners.set(event, []);
      listeners.get(event)!.push(handler);
    },
    emit(event: string, params: any) {
      const handlers = listeners.get(event) || [];
      for (const handler of handlers) handler(params);
    },
  };
}

describe('tracePageLoad', () => {
  let cdp: ReturnType<typeof createMockCdpSession>;
  let handle: TraceHandle;

  beforeEach(async () => {
    cdp = createMockCdpSession();
    handle = await tracePageLoad(cdp as any);
  });

  test('enables Network and Page domains', () => {
    const methods = cdp.calls.map((c) => c.method);
    expect(methods).toContain('Network.enable');
    expect(methods).toContain('Page.enable');
  });

  test('injects PerformanceObserver script before navigation', () => {
    const scriptCall = cdp.calls.find((c) => c.method === 'Page.addScriptToEvaluateOnNewDocument');
    expect(scriptCall).toBeTruthy();
    expect(scriptCall!.params.source).toContain('__zeitzeuge_longTasks');
    expect(scriptCall!.params.source).toContain('PerformanceObserver');
  });

  test('assembles network requests from CDP events', async () => {
    // Simulate a script request
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'req-script',
      request: { url: 'http://localhost/app.js', method: 'GET' },
      timestamp: 1.0,
      initiator: { type: 'parser' },
      type: 'Script',
    });
    cdp.emit('Network.responseReceived', {
      requestId: 'req-script',
      response: {
        status: 200,
        mimeType: 'application/javascript',
        encodedDataLength: 100,
        priority: 'High',
        renderBlocking: 'blocking',
      },
      type: 'Script',
    });
    cdp.emit('Network.loadingFinished', {
      requestId: 'req-script',
      timestamp: 1.5,
      encodedDataLength: 100,
    });

    const result = await handle.stop();

    expect(result.networkRequests.length).toBe(1);
    const req = result.networkRequests[0];
    expect(req.url).toBe('http://localhost/app.js');
    expect(req.resourceType).toBe('Script');
    expect(req.status).toBe(200);
    expect(req.isRenderBlocking).toBe(true);
    expect(req.responseBody).toBe('console.log("hello");');
  });

  test('captures response bodies for text types only', async () => {
    // Script (text — should capture)
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'req-script',
      request: { url: 'http://localhost/app.js', method: 'GET' },
      timestamp: 1.0,
      type: 'Script',
    });
    cdp.emit('Network.loadingFinished', {
      requestId: 'req-script',
      timestamp: 1.5,
    });

    // Image (binary — should NOT capture body)
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'req-image',
      request: { url: 'http://localhost/logo.png', method: 'GET' },
      timestamp: 1.0,
      type: 'Image',
    });
    cdp.emit('Network.loadingFinished', {
      requestId: 'req-image',
      timestamp: 1.5,
    });

    const result = await handle.stop();
    const script = result.networkRequests.find((r) => r.url.includes('app.js'));
    const image = result.networkRequests.find((r) => r.url.includes('logo.png'));

    expect(script?.responseBody).toBeTruthy();
    expect(image?.responseBody).toBeNull();
  });

  test('skips response bodies larger than 2MB', async () => {
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'req-large',
      request: { url: 'http://localhost/huge.js', method: 'GET' },
      timestamp: 1.0,
      type: 'Script',
    });
    cdp.emit('Network.loadingFinished', {
      requestId: 'req-large',
      timestamp: 2.0,
    });

    const result = await handle.stop();
    const large = result.networkRequests.find((r) => r.url.includes('huge.js'));
    expect(large?.responseBody).toBeNull();
  });

  test('collects long tasks from page', async () => {
    const result = await handle.stop();
    expect(result.metrics.longTasks.length).toBe(1);
    expect(result.metrics.longTasks[0].duration).toBe(120);
  });

  test('calculates total blocking time correctly', async () => {
    const result = await handle.stop();
    // TBT = max(0, 120 - 50) = 70
    expect(result.metrics.totalBlockingTime).toBe(70);
  });

  test('collects paint timing metrics', async () => {
    const result = await handle.stop();
    expect(result.metrics.firstPaint).toBe(200);
    expect(result.metrics.firstContentfulPaint).toBe(250);
  });

  test('disables Network domain on stop', async () => {
    await handle.stop();
    const methods = cdp.calls.map((c) => c.method);
    expect(methods).toContain('Network.disable');
  });

  test('starts Chrome Tracing before navigation', () => {
    const methods = cdp.calls.map((c) => c.method);
    expect(methods).toContain('Tracing.start');
    const tracingCall = cdp.calls.find((c) => c.method === 'Tracing.start');
    expect(tracingCall!.params.traceConfig.includedCategories).toContain('devtools.timeline');
    expect(tracingCall!.params.transferMode).toBe('ReportEvents');
  });

  test('stops Chrome Tracing on stop() and collects runtime trace', async () => {
    const result = await handle.stop();
    const methods = cdp.calls.map((c) => c.method);
    expect(methods).toContain('Tracing.end');
    // Runtime trace should be parsed from the mock events
    expect(result.runtimeTrace).toBeDefined();
    expect(result.runtimeTrace!.totalEvents).toBeGreaterThan(0);
    expect(result.runtimeTrace!.mainThreadId).toBe(1);
  });

  test('runtime trace includes blocking functions from trace events', async () => {
    const result = await handle.stop();
    // The mock emits a FunctionCall with 80ms duration → blocking
    expect(result.runtimeTrace!.blockingFunctions.length).toBe(1);
    expect(result.runtimeTrace!.blockingFunctions[0].functionName).toBe('init');
    expect(result.runtimeTrace!.blockingFunctions[0].duration).toBe(80);
  });
});

describe('tracePageLoad — Tracing.start failure', () => {
  test('continues without runtime trace when Tracing.start fails', async () => {
    const cdp = createMockCdpSession({ tracingStartFails: true });
    const handle = await tracePageLoad(cdp as any);

    // Simulate a network request to make sure stop() still works
    cdp.emit('Network.requestWillBeSent', {
      requestId: 'req-script',
      request: { url: 'http://localhost/app.js', method: 'GET' },
      timestamp: 1.0,
      type: 'Script',
    });
    cdp.emit('Network.loadingFinished', {
      requestId: 'req-script',
      timestamp: 1.5,
    });

    const result = await handle.stop();
    // Network trace should still work
    expect(result.networkRequests.length).toBe(1);
    // Runtime trace should be undefined
    expect(result.runtimeTrace).toBeUndefined();
  });
});
