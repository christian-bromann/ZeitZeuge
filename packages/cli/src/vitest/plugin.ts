/**
 * Vitest plugin that instruments test runs with V8 CPU profiling
 * and triggers Deep Agent analysis after tests complete.
 */

import { join, parse, resolve } from 'node:path';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { ZeitZeugeReporter } from './reporter.js';
import { generateListenerTrackerScript } from './listener-tracker.js';
import type { ZeitZeugeVitestOptions } from './types.js';

function uniq(values: string[]): string[] {
  return Array.from(new Set(values));
}

function sanitizePathSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^_+/, '');
}

function addSuffixToFilename(filePath: string, suffix: string): string {
  const p = parse(filePath);
  const nextName = p.ext ? `${p.name}-${suffix}${p.ext}` : `${p.base}-${suffix}`;
  return join(p.dir, nextName);
}

/**
 * Create a Vite plugin that hooks into Vitest via the configureVitest hook.
 *
 * Injects --cpu-prof into worker execArgv, disables file parallelism for
 * cleaner per-file profiles, and attaches a ZeitZeugeReporter that runs
 * analysis after tests complete.
 */
export function zeitzeuge(options: ZeitZeugeVitestOptions = {}) {
  const outputProvided = Object.prototype.hasOwnProperty.call(options, 'output');
  const profileDirProvided = Object.prototype.hasOwnProperty.call(options, 'profileDir');

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

      const { vitest, project } = context;
      const isWorkspace = Array.isArray(vitest?.projects) && vitest.projects.length > 1;
      const projectName = project?.name ? String(project.name) : '';
      const safeProjectName = projectName ? sanitizePathSegment(projectName) : '';

      // In Vitest workspaces, multiple projects can run in parallel.
      // Use per-project directories/files by default to avoid collisions.
      const baseProfileDir = resolve(profileDir);
      const resolvedProfileDir =
        isWorkspace && !profileDirProvided && safeProjectName
          ? resolve(baseProfileDir, safeProjectName)
          : baseProfileDir;

      const baseOutput = resolve(output);
      const resolvedOutput =
        isWorkspace && !outputProvided && safeProjectName
          ? addSuffixToFilename(baseOutput, safeProjectName)
          : baseOutput;

      // 1. Clean and (re-)create the profile output directory.
      //    Remove stale profiles from previous runs so they don't interfere
      //    with mtime-based profile-to-test correlation.
      //    Node.js --cpu-prof-dir requires the directory to exist before
      //    workers start — it won't create it.
      try {
        if (existsSync(resolvedProfileDir)) {
          rmSync(resolvedProfileDir, { recursive: true, force: true });
        }
        mkdirSync(resolvedProfileDir, { recursive: true });
      } catch {
        // ignore — if we can't create it, profiling just won't work
      }

      // 2. Write the event listener tracker preload script.
      //    This ESM module is loaded in each worker via --import and patches
      //    EventTarget/EventEmitter to track listener add/remove patterns.
      const trackerPath = join(resolvedProfileDir, '_listener-tracker.mjs');
      try {
        writeFileSync(trackerPath, generateListenerTrackerScript(resolvedProfileDir));
      } catch {
        // Non-fatal: listener tracking simply won't be available
      }

      // Mutate the PROJECT config so worker processes inherit execArgv.
      // In Vitest workspaces, each project has its own resolved config and
      // is serialized separately for its workers.
      const targetConfig = project?.config ?? vitest.config;

      // 3. Inject CPU profiling flags and listener tracker into worker execArgv.
      //    Set both top-level execArgv AND poolOptions.forks.execArgv
      //    to ensure the flags reach the actual worker processes.
      const cpuProfArgs = ['--cpu-prof', `--cpu-prof-dir=${resolvedProfileDir}`];
      const heapProfArgs = heapProf ? ['--heap-prof', `--heap-prof-dir=${resolvedProfileDir}`] : [];
      const trackerArgs = [`--import=${trackerPath}`];
      const profilingArgs = [...trackerArgs, ...cpuProfArgs, ...heapProfArgs];

      const existingArgv: string[] = targetConfig.execArgv ?? [];
      targetConfig.execArgv = uniq([...existingArgv, ...profilingArgs]);

      // 4. Force pool: 'forks' — --cpu-prof via execArgv is only reliably
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

      // 5. Disable file parallelism for deterministic, per-file profiles
      targetConfig.fileParallelism = false;

      // 6. Attach our reporter
      const reporter = new ZeitZeugeReporter({
        output: resolvedOutput,
        profileDir: resolvedProfileDir,
        analyzeOnFinish,
        verbose,
        projectRoot: resolve(projectRoot),
        projectName: projectName || undefined,
      });

      // Push reporter — config.reporters is already resolved as an array
      if (Array.isArray(vitest.config.reporters)) {
        vitest.config.reporters.push(reporter);
      } else {
        vitest.config.reporters = [reporter];
      }

      if (verbose) {
        console.log(`[zeitzeuge] Plugin enabled — CPU profiling to ${resolvedProfileDir}`);
        console.log(`[zeitzeuge] project: ${projectName || '(root)'}`);
        if (isWorkspace && !profileDirProvided && safeProjectName) {
          console.log(`[zeitzeuge] workspace mode: per-project profile directory enabled`);
        }
        if (isWorkspace && !outputProvided && safeProjectName) {
          console.log(`[zeitzeuge] workspace mode: per-project report file enabled`);
        }
        console.log(`[zeitzeuge] execArgv: ${JSON.stringify(targetConfig.execArgv)}`);
        console.log(`[zeitzeuge] pool: ${targetConfig.pool}`);
      }
    },
  };
}
