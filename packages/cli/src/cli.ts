#!/usr/bin/env node

import yargs from 'yargs';
import { hideBin } from 'yargs/helpers';
import {
  initModel,
  printFindings,
  printHeader,
  printError,
  printCaptureInfo,
  createSpinner,
  formatBytes,
  writeReport,
} from '@zeitzeuge/utils';
import { analyze } from './analysis/agent.js';
import { launchBrowser, closeBrowser, type Browser } from './browser/launch.js';
import { capturePage } from './browser/capture.js';
import { parseSnapshot } from './analysis/parser.js';
import { createWorkspace } from './sandbox/workspace.js';

// Read version from package.json
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

function getVersion(): string {
  try {
    const __dirname = dirname(fileURLToPath(import.meta.url));
    const pkgPath = resolve(__dirname, '..', 'package.json');
    const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
    return pkg.version ?? '0.3.0';
  } catch {
    return '0.3.0';
  }
}

const VERSION = getVersion();

const argv = yargs(hideBin(process.argv))
  .scriptName('zeitzeuge')
  .usage('Usage: $0 <url> [options]')
  .command('$0 <url>', 'Analyze frontend performance of a URL', (yargs) => {
    return yargs.positional('url', {
      describe: 'Target URL to analyze (e.g. http://localhost:3000)',
      type: 'string',
      demandOption: true,
    });
  })
  .option('verbose', {
    alias: 'v',
    type: 'boolean',
    default: false,
    describe: 'Enable verbose/debug logging',
  })
  .option('headless', {
    type: 'boolean',
    default: true,
    describe: 'Run Chrome in headless mode',
  })
  .option('timeout', {
    type: 'number',
    default: 30000,
    describe: 'Page load timeout in milliseconds',
  })
  .option('output', {
    alias: 'o',
    type: 'string',
    default: 'zeitzeuge-report.md',
    describe: 'Output path for the Markdown report',
  })
  .help('help', 'Show help')
  .alias('h', 'help')
  .version(VERSION)
  .strict()
  .parseSync();

/**
 * Validate that a string is a valid HTTP(S) URL.
 */
function validateUrl(url: string): void {
  try {
    const parsed = new URL(url);
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      throw new Error('URL must use http:// or https:// protocol');
    }
  } catch (err) {
    if (err instanceof Error && err.message.includes('protocol')) {
      throw err;
    }
    throw new Error(
      `Invalid URL: "${url}". Please provide a valid URL (e.g. http://localhost:3000)`,
    );
  }
}

async function main(): Promise<void> {
  const url = argv.url as string;
  const verbose = argv.verbose as boolean;
  let browser: Browser | undefined;

  try {
    // Validate URL
    validateUrl(url);

    // Print header
    printHeader(url, VERSION);

    // Step 1: Initialize LLM model
    if (verbose) console.log('[verbose] Detecting API key and initializing model...');
    const model = initModel();
    if (verbose) console.log(`[verbose] Model initialized: ${model.constructor.name}`);

    // Step 2: Launch browser
    const browserSpinner = createSpinner('Launching browser...');
    try {
      browser = activeBrowser = await launchBrowser({ headless: argv.headless as boolean });
      browserSpinner.succeed(`Browser launched (${argv.headless ? 'headless' : 'headed'})`);
    } catch (err) {
      browserSpinner.fail('Failed to launch browser');
      throw new Error(
        'Could not launch Chrome. Make sure Chrome/Chromium is installed.\n' +
          '  Install: https://www.google.com/chrome/\n' +
          (err instanceof Error ? `  Details: ${err.message}` : ''),
      );
    }

    // Step 3: Capture heap snapshot + performance trace + network assets
    const captureSpinner = createSpinner(`Loading ${url} & capturing data...`);
    let captureResult;
    try {
      captureResult = await capturePage(browser, url, {
        timeout: argv.timeout as number,
      });
      const heapSizeMB = (captureResult.heapSnapshot.data.length / (1024 * 1024)).toFixed(1);
      const reqCount = captureResult.trace.networkRequests.length;
      const longTaskCount = captureResult.trace.metrics.longTasks.length;
      const runtimeTraceInfo = captureResult.trace.runtimeTrace
        ? `\n   Runtime trace: ${captureResult.trace.runtimeTrace.totalEvents.toLocaleString()} events captured`
        : '';
      captureSpinner.succeed(
        `Page loaded in ${(captureResult.trace.metrics.loadComplete / 1000).toFixed(1)}s\n` +
          `   Heap snapshot: ${heapSizeMB} MB\n` +
          `   Network requests: ${reqCount} captured\n` +
          `   Long tasks: ${longTaskCount} detected` +
          runtimeTraceInfo,
      );
    } catch (err) {
      captureSpinner.fail('Failed to capture page data');
      throw new Error(
        `Failed to capture data from ${url}.\n` +
          '  Try running with --no-headless if the page requires interaction.\n' +
          (err instanceof Error ? `  Details: ${err.message}` : ''),
      );
    }

    // Step 4: Parse the heap snapshot
    const parseSpinner = createSpinner('Parsing heap snapshot...');
    const heapSummary = parseSnapshot(captureResult.heapSnapshot);
    parseSpinner.succeed(
      `Parsed: ${heapSummary.metadata.nodeCount.toLocaleString()} nodes, ${heapSummary.metadata.edgeCount.toLocaleString()} edges`,
    );

    // Step 5: Build workspace with everything
    const workspaceSpinner = createSpinner('Building workspace...');
    let workspace;
    try {
      workspace = await createWorkspace({
        heapSummary,
        traceResult: captureResult.trace,
        url,
      });
      const storedCount = captureResult.trace.networkRequests.filter((r) => r.responseBody).length;
      const totalSize = captureResult.trace.networkRequests
        .filter((r) => r.responseBody)
        .reduce((sum, r) => sum + (r.responseBody?.length ?? 0), 0);
      const runtimeWorkspaceInfo = captureResult.trace.runtimeTrace
        ? `\n   Runtime trace: summaries + raw events`
        : '';
      workspaceSpinner.succeed(
        `${storedCount} assets stored in workspace (${formatBytes(totalSize)} total)` +
          runtimeWorkspaceInfo,
      );
    } catch (err) {
      workspaceSpinner.fail('Failed to build workspace');
      throw new Error(
        'Failed to create workspace.\n' + (err instanceof Error ? `  Details: ${err.message}` : ''),
      );
    }

    // Step 6: Analyze the workspace
    const agentSpinner = createSpinner('Analyzing...');
    let findings;
    try {
      findings = await analyze(model, workspace.backend, agentSpinner, {
        url,
        heapSummary,
        traceResult: captureResult.trace,
        workspaceFiles: workspace.files,
      });
      agentSpinner.succeed(`Analysis complete — ${findings.length} findings`);
    } catch (err) {
      agentSpinner.fail(`Analysis failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
      throw new Error(
        'LLM analysis failed. Check your API key and network connection.\n' +
          (err instanceof Error ? `  Details: ${err.message}` : ''),
      );
    } finally {
      workspace.cleanup();
    }

    // Step 7: Print results
    printFindings(findings);
    printCaptureInfo(heapSummary, captureResult.trace);

    // Step 8: Write Markdown report to disk
    const outputPath = argv.output as string;
    const reportPath = writeReport(resolve(outputPath), {
      url,
      version: VERSION,
      findings,
      heapSummary,
      trace: captureResult.trace,
    });
    console.log(`\n📄 Report written to ${reportPath}\n`);
  } catch (err) {
    printError(err);
    process.exit(1);
  } finally {
    if (browser) {
      await closeBrowser(browser);
    }
  }
}

// Register SIGINT handler for graceful cleanup
let activeBrowser: Browser | undefined;
process.on('SIGINT', async () => {
  if (activeBrowser) {
    await closeBrowser(activeBrowser);
  }
  process.exit(130);
});

main();
