import type { Browser } from "webdriverio";
import type { CaptureResult, CaptureOptions } from "../types.js";
import { tracePageLoad } from "./trace.js";

/**
 * Capture both a heap snapshot and a performance trace from a single page load.
 *
 * Flow:
 * 1. Set up network interception + performance tracing BEFORE navigation
 * 2. Navigate to URL and wait for load
 * 3. Wait for settle period (2s) to catch late-firing long tasks
 * 4. Stop tracing and collect network data
 * 5. Take heap snapshot (after page is loaded + settled)
 */
export async function capturePage(
  browser: Browser,
  url: string,
  options: CaptureOptions = {}
): Promise<CaptureResult> {
  const { timeout = 30000 } = options;

  // Get a CDP session via Puppeteer
  const puppeteerBrowser = await browser.getPuppeteer();
  const pages = await puppeteerBrowser.pages();
  const page = pages[0];
  if (!page) {
    throw new Error("No page found in Puppeteer browser");
  }

  const cdpSession = await page.createCDPSession();

  // Set up network interception + performance tracing BEFORE navigation
  const traceHandle = await tracePageLoad(cdpSession, options);

  // Navigate and wait for page load
  await page.goto(url, {
    waitUntil: "load",
    timeout,
  });

  // Wait for settle period (allow late-firing long tasks)
  await new Promise((r) => setTimeout(r, 2000));

  // Collect the trace results
  const traceResult = await traceHandle.stop();

  // Now take the heap snapshot (after page is loaded + settled)
  await cdpSession.send("HeapProfiler.enable");

  const chunks: string[] = [];
  cdpSession.on("HeapProfiler.addHeapSnapshotChunk", (params: any) => {
    chunks.push(params.chunk);
  });

  // Force garbage collection before snapshot for accuracy
  await cdpSession.send("HeapProfiler.collectGarbage");

  // Take the snapshot
  await cdpSession.send("HeapProfiler.takeHeapSnapshot", {
    reportProgress: false,
  });

  // Disable HeapProfiler and detach the session
  await cdpSession.send("HeapProfiler.disable");
  await cdpSession.detach();

  return {
    heapSnapshot: {
      data: chunks.join(""),
      capturedAt: Date.now(),
      url,
    },
    trace: traceResult,
  };
}
