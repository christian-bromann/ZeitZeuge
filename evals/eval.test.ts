/**
 * Alternative eval runner using Bun's test framework.
 *
 * Run with: cd evals && bun test eval.test.ts
 *
 * This wraps the same evaluation logic in a test harness with
 * assertions against scoring targets from the spec.
 */

import { resolve, dirname } from 'node:path';
import { test, expect, describe } from 'bun:test';

import { runAgent } from './src/run-agent.js';
import { REFERENCE_FINDINGS } from './src/reference-findings.js';
import { computeCoverage } from './src/evaluators/finding-coverage.js';
import { findingQuality } from './src/evaluators/finding-quality.js';
import { codeFixes } from './src/evaluators/code-fix-quality.js';
import { severityAccuracy } from './src/evaluators/severity-accuracy.js';
import { noHallucination } from './src/evaluators/no-hallucination.js';
import type { Finding } from '@zeitzeuge/utils';

// Absolute paths derived from this file's location
const ROOT = resolve(dirname(import.meta.filename), '..');
const DATASET_PATH = resolve(ROOT, 'evals', 'dataset');
const PROJECT_ROOT = resolve(ROOT, 'example');

// The agent can take several minutes to run
const AGENT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

describe('Zeitzeuge Agent Quality', () => {
  let findings: Finding[];

  // Run the agent once, share findings across tests
  test(
    'agent produces findings from static dataset',
    async () => {
      console.log(
        `[eval] Running agent against ${REFERENCE_FINDINGS.length} reference findings...`,
      );

      const result = await runAgent({
        datasetPath: DATASET_PATH,
        projectRoot: PROJECT_ROOT,
      });

      findings = result.findings;
      console.log(`[eval] Agent produced ${findings.length} finding(s)`);

      expect(findings.length).toBeGreaterThan(0);
    },
    AGENT_TIMEOUT,
  );

  test('finding coverage meets targets', () => {
    expect(findings).toBeDefined();

    const coverage = computeCoverage(findings);

    console.log('\n=== Finding Coverage ===');
    console.log(
      `  Overall:                  ${(coverage.overallCoverage * 100).toFixed(1)}% (target: ≥80%)`,
    );
    console.log(
      `  Blocking:                 ${(coverage.blockingCoverage * 100).toFixed(1)}% (target: ≥80%)`,
    );
    console.log(
      `  Listener Leak:            ${(coverage.listenerLeakCoverage * 100).toFixed(1)}% (target: ≥70%)`,
    );
    console.log(
      `  Slow Code Path:           ${(coverage.slowCodePathCoverage * 100).toFixed(1)}% (target: ≥80%)`,
    );
    console.log(`  Closure Leak:             ${(coverage.closureLeakCoverage * 100).toFixed(1)}%`);
    console.log(
      `  Excessive Instantiation:  ${(coverage.excessiveInstantiationCoverage * 100).toFixed(1)}%`,
    );
    console.log(
      `  Matched:                  ${coverage.matchedFindings.length}/${REFERENCE_FINDINGS.length}`,
    );
    console.log(`  Missed:                   ${coverage.missedFindings.join(', ') || '(none)'}`);
    console.log(`  False Positives:          ${coverage.falsePositives}`);

    // Scoring targets (soft — logged but not hard failures initially)
    expect(coverage.overallCoverage).toBeGreaterThanOrEqual(0.8);
    expect(coverage.blockingCoverage).toBeGreaterThanOrEqual(0.8);
    expect(coverage.listenerLeakCoverage).toBeGreaterThanOrEqual(0.7);
    expect(coverage.slowCodePathCoverage).toBeGreaterThanOrEqual(0.8);
  });

  test(
    'finding quality meets targets',
    async () => {
      expect(findings).toBeDefined();

      const inputs = { datasetPath: DATASET_PATH, projectRoot: PROJECT_ROOT };
      const outputs = { findings };
      const scores = await findingQuality({ inputs, outputs });

      console.log('\n=== Finding Quality ===');
      console.log(`  Accuracy:      ${scores.quality_accuracy?.toFixed(2)}/5`);
      console.log(`  Specificity:   ${scores.quality_specificity?.toFixed(2)}/5`);
      console.log(`  Actionability: ${scores.quality_actionability?.toFixed(2)}/5`);
      console.log(`  Explanation:   ${scores.quality_explanation?.toFixed(2)}/5`);
      console.log(`  Overall:       ${scores.quality_overall?.toFixed(2)}/5 (target: ≥4)`);

      expect(scores.quality_overall).toBeGreaterThanOrEqual(4);
    },
    AGENT_TIMEOUT,
  );

  test(
    'code fix quality meets targets',
    async () => {
      expect(findings).toBeDefined();

      const inputs = { datasetPath: DATASET_PATH, projectRoot: PROJECT_ROOT };
      const outputs = { findings };
      const scores = await codeFixes({ inputs, outputs });

      console.log('\n=== Code Fix Quality ===');
      console.log(
        `  Correctness:       ${((scores.code_fix_correctness ?? 0) * 100).toFixed(1)}% (target: ≥40%)`,
      );
      console.log(
        `  Has before/after:  ${((scores.code_fix_has_before_after ?? 0) * 100).toFixed(1)}%`,
      );

      expect(scores.code_fix_correctness ?? 0).toBeGreaterThanOrEqual(0.4);
    },
    AGENT_TIMEOUT,
  );

  test('severity accuracy meets targets', async () => {
    expect(findings).toBeDefined();

    const inputs = { datasetPath: DATASET_PATH, projectRoot: PROJECT_ROOT };
    const outputs = { findings };
    const scores = await severityAccuracy({ inputs, outputs });

    console.log('\n=== Severity Accuracy ===');
    console.log(
      `  Accuracy: ${((scores.severity_accuracy ?? 0) * 100).toFixed(1)}% (target: ≥75%)`,
    );

    expect(scores.severity_accuracy ?? 0).toBeGreaterThanOrEqual(0.75);
  });

  test('hallucination rate meets targets', async () => {
    expect(findings).toBeDefined();

    const inputs = { datasetPath: DATASET_PATH, projectRoot: PROJECT_ROOT };
    const outputs = { findings };
    const scores = await noHallucination({ inputs, outputs });

    console.log('\n=== Hallucination Check ===');
    console.log(
      `  Hallucination rate:   ${((scores.hallucination_rate ?? 0) * 100).toFixed(1)}% (target: ≤10%)`,
    );
    console.log(
      `  Source file accuracy: ${((scores.source_file_accuracy ?? 0) * 100).toFixed(1)}%`,
    );

    expect(scores.hallucination_rate ?? 0).toBeLessThanOrEqual(0.1);
  });
});
