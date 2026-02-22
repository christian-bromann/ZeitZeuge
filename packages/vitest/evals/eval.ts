/**
 * LangSmith eval runner for the vitest performance agent.
 *
 * Run with: cd packages/vitest && bun run evals/eval.ts
 */

import { evaluate } from 'langsmith/evaluation';
import { Client } from 'langsmith';

import { runAgent } from './src/run-agent.js';
import { REFERENCE_FINDINGS } from './src/reference-findings.js';
import { findingCoverage } from './src/evaluators/finding-coverage.js';
import { findingQuality } from './src/evaluators/finding-quality.js';
import { codeFixes } from './src/evaluators/code-fix-quality.js';
import { severityAccuracy } from './src/evaluators/severity-accuracy.js';
import { noHallucination } from './src/evaluators/no-hallucination.js';

const DATASET_NAME = 'zeitzeuge-vitest-example';

async function ensureDataset(client: Client): Promise<void> {
  const input = {
    datasetPath: './packages/vitest/evals/dataset',
    projectRoot: './example',
  };
  const referenceOutput = {
    referenceFindings: REFERENCE_FINDINGS,
  };

  let dataset;
  try {
    dataset = await client.readDataset({ datasetName: DATASET_NAME });
  } catch {
    dataset = await client.createDataset(DATASET_NAME, {
      description:
        'Zeitzeuge Vitest performance analysis evaluation dataset. ' +
        'Contains pre-captured CPU profiles and listener tracking data ' +
        'from the example project with deliberate performance flaws.',
    });
  }

  const examples = [];
  for await (const example of client.listExamples({ datasetId: dataset.id })) {
    examples.push(example);
  }

  if (examples.length === 0) {
    await client.createExample(input, referenceOutput, {
      datasetId: dataset.id,
    });
    console.log(`[evals] Created dataset "${DATASET_NAME}" with 1 example`);
  } else {
    const existingExample = examples[0]!;
    await client.updateExample(existingExample.id, {
      inputs: input,
      outputs: referenceOutput,
    });
    console.log(`[evals] Updated dataset "${DATASET_NAME}" (1 example)`);
  }
}

async function main(): Promise<void> {
  console.log('[evals] Starting vitest agent evaluation...');
  console.log(`[evals] Reference findings: ${REFERENCE_FINDINGS.length} known flaws`);

  const client = new Client();
  await ensureDataset(client);

  const target = (inputs: Record<string, unknown>) =>
    runAgent(inputs as { datasetPath: string; projectRoot: string });

  const results = await evaluate(target as any, {
    data: DATASET_NAME,
    evaluators: [
      findingCoverage as any,
      findingQuality as any,
      codeFixes as any,
      severityAccuracy as any,
      noHallucination as any,
    ],
    experimentPrefix: 'zeitzeuge-vitest',
    maxConcurrency: 1,
  });

  console.log('\n[evals] Evaluation complete!');
  console.log('[evals] Results:', JSON.stringify(results, null, 2));
}

main().catch((err) => {
  console.error('[evals] Fatal error:', err);
  process.exit(1);
});
