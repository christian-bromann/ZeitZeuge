/**
 * Vitest plugin that instruments test runs with V8 CPU profiling
 * and triggers Deep Agent analysis after tests complete.
 */

import { resolve } from 'node:path';
import { mkdirSync } from 'node:fs';
import { ZeitZeugeReporter } from './reporter.js';
import type { ZeitZeugeVitestOptions } from './types.js';

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

  return {
    name: 'vitest:zeitzeuge',

    configureVitest(context: any) {
      if (!enabled) return;

      const { vitest } = context;
      const resolvedProfileDir = resolve(profileDir);

      // 1. Create the profile output directory — Node.js --cpu-prof-dir
      //    requires it to exist before workers start, it won't create it.
      try {
        mkdirSync(resolvedProfileDir, { recursive: true });
      } catch {
        // ignore — if we can't create it, profiling just won't work
      }

      // 2. Inject CPU profiling flags into worker execArgv.
      //    Set both top-level execArgv AND poolOptions.forks.execArgv
      //    to ensure the flags reach the actual worker processes.
      const cpuProfArgs = ['--cpu-prof', `--cpu-prof-dir=${resolvedProfileDir}`];
      const heapProfArgs = heapProf ? ['--heap-prof', `--heap-prof-dir=${resolvedProfileDir}`] : [];
      const profilingArgs = [...cpuProfArgs, ...heapProfArgs];

      const existingArgv: string[] = vitest.config.execArgv ?? [];
      vitest.config.execArgv = [...existingArgv, ...profilingArgs];

      // 3. Force pool: 'forks' — --cpu-prof via execArgv is only reliably
      //    passed to forked child processes (not worker_threads).
      vitest.config.pool = 'forks';

      // Also set poolOptions.forks.execArgv as belt-and-suspenders
      if (!vitest.config.poolOptions) {
        vitest.config.poolOptions = {};
      }
      if (!vitest.config.poolOptions.forks) {
        vitest.config.poolOptions.forks = {};
      }
      const existingForksArgv: string[] = vitest.config.poolOptions.forks.execArgv ?? [];
      vitest.config.poolOptions.forks.execArgv = [...existingForksArgv, ...profilingArgs];

      // 4. Disable file parallelism for deterministic, per-file profiles
      vitest.config.fileParallelism = false;

      // 5. Attach our reporter
      const reporter = new ZeitZeugeReporter({
        output: resolve(output),
        profileDir: resolvedProfileDir,
        analyzeOnFinish,
        verbose,
        projectRoot: resolve(projectRoot),
      });

      // Push reporter — config.reporters is already resolved as an array
      if (Array.isArray(vitest.config.reporters)) {
        vitest.config.reporters.push(reporter);
      } else {
        vitest.config.reporters = [reporter];
      }

      if (verbose) {
        console.log(`[zeitzeuge] Plugin enabled — CPU profiling to ${resolvedProfileDir}`);
        console.log(`[zeitzeuge] execArgv: ${JSON.stringify(vitest.config.execArgv)}`);
        console.log(`[zeitzeuge] pool: ${vitest.config.pool}`);
      }
    },
  };
}
