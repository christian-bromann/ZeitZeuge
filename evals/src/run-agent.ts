/**
 * Target function for LangSmith evaluation.
 *
 * Invokes the full zeitzeuge agent pipeline against the static eval
 * dataset and returns the findings. This is the function passed to
 * `evaluate()`.
 */

import ora from 'ora';

import { initModel, type Finding } from '@zeitzeuge/utils';
import { analyzeTestPerformance } from '@zeitzeuge/vitest';

import { buildWorkspaceFromDataset } from './build-workspace.js';

export interface RunAgentInputs {
  datasetPath: string;
  projectRoot: string;
}

export interface RunAgentOutput {
  findings: Finding[];
}

/**
 * Run the zeitzeuge Deep Agent against a static dataset.
 *
 * This mirrors what the Vitest reporter does during a live run,
 * but uses pre-captured CPU profiles and listener-tracking data.
 */
export async function runAgent(inputs: RunAgentInputs): Promise<RunAgentOutput> {
  const { datasetPath, projectRoot } = inputs;

  // 1. Build the VFS workspace from the static dataset
  const workspace = await buildWorkspaceFromDataset(datasetPath, projectRoot);

  try {
    // 2. Initialize the LLM (respects ANTHROPIC_API_KEY / OPENAI_API_KEY / ZEITZEUGE_MODEL)
    const model = await initModel();

    // 3. Create a headless spinner (no terminal animation during evals)
    const spinner = ora({ text: 'Analyzing...', isEnabled: false }).start();

    // 4. Run the Deep Agent analysis (parallel subagents)
    const findings = await analyzeTestPerformance(
      model,
      workspace.backend,
      spinner,
      {
        metrics: workspace.metrics,
        hasHeapProfiles: false,
        hasListenerTracking: workspace.hasListenerTracking,
        sourceFiles: workspace.sourceFiles,
        testFiles: workspace.testFiles,
      },
      { animateProgress: false },
    );

    spinner.stop();

    return { findings };
  } finally {
    // 5. Always clean up the temporary workspace
    workspace.cleanup();
  }
}
