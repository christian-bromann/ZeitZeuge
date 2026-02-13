/**
 * Vitest plugin that instruments test runs with V8 CPU profiling
 * and triggers Deep Agent analysis after tests complete.
 */

import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ZeitZeugeReporter } from './reporter.js';
import type { ZeitZeugeVitestOptions } from './types.js';

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

/**
 * Create a Vite plugin that hooks into Vitest via the configureVitest hook.
 *
 * Injects --cpu-prof into worker execArgv, disables file parallelism for
 * cleaner per-file profiles, and attaches a ZeitZeugeReporter that runs
 * analysis after tests complete.
 */
export function zeitzeuge(options: ZeitZeugeVitestOptions = {}) {
  const {
    enabled = true,
    output = 'zeitzeuge-report.md',
    profileDir = '.zeitzeuge-profiles',
    heapProf = false,
    analyzeOnFinish = true,
    verbose = false,
    projectRoot = process.cwd(),
  } = options;

  // configureVitest can run once per project in a Vitest workspace.
  // Reporters are global (not project-scoped), so only attach ours once.
  let reporterAttached = false;

  return {
    name: 'vitest:zeitzeuge',

    configureVitest(context: any) {
      if (!enabled) return;

      const { vitest, project } = context;
      const resolvedProfileDir = resolve(profileDir);

      // 1. Create the profile output directory — Node.js --cpu-prof-dir
      //    requires it to exist before workers start, it won't create it.
      try {
        mkdirSync(resolvedProfileDir, { recursive: true });
      } catch {
        // ignore — if we can't create it, profiling just won't work
      }

      // Mutate the PROJECT config so worker processes inherit execArgv.
      // In Vitest workspaces, each project has its own resolved config and
      // is serialized separately for its workers.
      const targetConfig = project?.config ?? vitest.config;

      // 2. Inject CPU profiling flags into worker execArgv.
      //    Set both top-level execArgv AND poolOptions.forks.execArgv
      //    to ensure the flags reach the actual worker processes.
      const cpuProfArgs = ['--cpu-prof', `--cpu-prof-dir=${resolvedProfileDir}`];
      const heapProfArgs = heapProf ? ['--heap-prof', `--heap-prof-dir=${resolvedProfileDir}`] : [];
      const profilingArgs = [...cpuProfArgs, ...heapProfArgs];

      const existingArgv: string[] = targetConfig.execArgv ?? [];
      targetConfig.execArgv = uniq([...existingArgv, ...profilingArgs]);

      // 3. Force pool: 'forks' — --cpu-prof via execArgv is only reliably
      //    passed to forked child processes (not worker_threads).
      targetConfig.pool = 'forks';

      // Also set poolOptions.forks.execArgv as belt-and-suspenders
      if (!targetConfig.poolOptions) {
        targetConfig.poolOptions = {};
      }
      if (!targetConfig.poolOptions.forks) {
        targetConfig.poolOptions.forks = {};
      }
      const existingForksArgv: string[] = targetConfig.poolOptions.forks.execArgv ?? [];
      targetConfig.poolOptions.forks.execArgv = uniq([...existingForksArgv, ...profilingArgs]);

      // 4. Disable file parallelism for deterministic, per-file profiles
      targetConfig.fileParallelism = false;

      // 5. Attach our reporter
      if (!reporterAttached) {
        const reporter = new ZeitZeugeReporter({
          output: resolve(output),
          profileDir: resolvedProfileDir,
          analyzeOnFinish,
          verbose,
          projectRoot: resolve(projectRoot),
        });

        // Push reporter — global config.reporters is already resolved as an array
        if (Array.isArray(vitest.config.reporters)) {
          vitest.config.reporters.push(reporter);
        } else {
          vitest.config.reporters = [reporter];
        }

        reporterAttached = true;
      }

      if (verbose) {
        const projectName = project?.name ? String(project.name) : '(root)';
        console.log(`[zeitzeuge] Plugin enabled — CPU profiling to ${resolvedProfileDir}`);
        console.log(`[zeitzeuge] project: ${projectName}`);
        console.log(`[zeitzeuge] execArgv: ${JSON.stringify(targetConfig.execArgv)}`);
        console.log(`[zeitzeuge] pool: ${targetConfig.pool}`);
      }
    },
  };
}
