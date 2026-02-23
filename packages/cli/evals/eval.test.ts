/**
 * CLI agent evaluation suite.
 *
 * Run with: cd packages/cli && bun test evals/eval.test.ts
 *
 * Starts the fixture-site Vite dev server, runs the zeitzeuge CLI
 * against it, then scores findings against known performance flaws.
 *
 * Requirements:
 *   - Chrome/Chromium must be installed (for Puppeteer)
 *   - ANTHROPIC_API_KEY or OPENAI_API_KEY must be set
 *   - fixture-site dependencies installed (cd evals/fixture-site && bun install)
 */

import { test, expect, describe, afterAll } from 'bun:test';
import type { Finding } from '@zeitzeuge/utils';

import { startFixtureSite, runCli } from './src/run-cli.js';
import { REFERENCE_FINDINGS } from './src/reference-findings.js';
import { computeCoverage } from './src/evaluators/finding-coverage.js';
import { computeSeverityAccuracy } from './src/evaluators/severity-accuracy.js';
import { computeHallucinationRate } from './src/evaluators/no-hallucination.js';

const CLI_TIMEOUT = 25 * 60 * 1000;

let stopServer: (() => void) | undefined;

afterAll(() => {
  const child = (runCli as any)._lastChild;
  if (child && !child.killed) {
    child.kill('SIGKILL');
  }
  if (stopServer) stopServer();
});

describe('Zeitzeuge CLI Agent Quality', () => {
  let findings: Finding[];

  test(
    'fixture site starts and CLI produces findings',
    async () => {
      console.log(`[eval] Starting fixture site dev server...`);

      const server = await startFixtureSite();
      stopServer = server.stop;

      console.log(`[eval] Fixture site running at ${server.url}`);
      console.log(`[eval] Running CLI against ${REFERENCE_FINDINGS.length} reference findings...`);

      const result = await runCli(server.url);
      findings = result.findings;

      console.log(`[eval] CLI produced ${findings.length} finding(s)`);
      if (result.metrics) {
        console.log(`[eval] Page metrics:`, JSON.stringify(result.metrics, null, 2));
      }

      expect(findings.length).toBeGreaterThan(0);
    },
    CLI_TIMEOUT,
  );

  test('finding coverage meets targets', () => {
    expect(findings).toBeDefined();

    const coverage = computeCoverage(findings);

    console.log('\n=== CLI Finding Coverage ===');
    console.log(
      `  Overall:            ${(coverage.overallCoverage * 100).toFixed(1)}% (target: ≥50%)`,
    );
    console.log(
      `  Render-Blocking:    ${(coverage.renderBlockingCoverage * 100).toFixed(1)}% (target: ≥67%)`,
    );
    console.log(`  Code Patterns:      ${(coverage.codePatternCoverage * 100).toFixed(1)}%`);
    console.log(`  Runtime Blocking:   ${(coverage.runtimeBlockingCoverage * 100).toFixed(1)}%`);
    console.log(`  Memory Issues:      ${(coverage.memoryIssueCoverage * 100).toFixed(1)}%`);
    console.log(`  Listener Leaks:     ${(coverage.listenerLeakCoverage * 100).toFixed(1)}%`);
    console.log(
      `  Matched:            ${coverage.matchedFindings.length}/${REFERENCE_FINDINGS.length}`,
    );
    console.log(`  Missed:             ${coverage.missedFindings.join(', ') || '(none)'}`);
    console.log(`  False Positives:    ${coverage.falsePositives}`);

    expect(coverage.overallCoverage).toBeGreaterThanOrEqual(0.5);
    expect(coverage.renderBlockingCoverage).toBeGreaterThanOrEqual(0.67);
  });

  test('severity accuracy meets targets', () => {
    expect(findings).toBeDefined();

    const scores = computeSeverityAccuracy(findings);

    console.log('\n=== CLI Severity Accuracy ===');
    console.log(
      `  Accuracy: ${((scores.severity_accuracy ?? 0) * 100).toFixed(1)}% (target: ≥60%)`,
    );

    expect(scores.severity_accuracy ?? 0).toBeGreaterThanOrEqual(0.6);
  });

  test('hallucination rate meets targets', () => {
    expect(findings).toBeDefined();

    const scores = computeHallucinationRate(findings);

    console.log('\n=== CLI Hallucination Check ===');
    console.log(
      `  Hallucination rate:       ${((scores.hallucination_rate ?? 0) * 100).toFixed(1)}% (target: ≤30%)`,
    );
    console.log(
      `  Source reference accuracy: ${((scores.source_reference_accuracy ?? 0) * 100).toFixed(1)}%`,
    );

    expect(scores.hallucination_rate ?? 0).toBeLessThanOrEqual(0.3);
  });
});
