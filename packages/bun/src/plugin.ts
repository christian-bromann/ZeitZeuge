/**
 * Programmatic API for running zeitzeuge analysis on Bun test results.
 *
 * Since Bun's test runner doesn't have the same plugin hook system as Vitest,
 * this module provides a function that can be called after `bun test` completes
 * to analyze the collected profiles and timing data.
 *
 * Usage:
 *
 * ```ts
 * // In a script that runs after `bun test`:
 * import { analyzeTestRun } from '@zeitzeuge/bun';
 *
 * await analyzeTestRun({
 *   profileDir: '.zeitzeuge-profiles',
 *   output: 'zeitzeuge-report.md',
 * });
 * ```
 *
 * Or as a complete pipeline:
 *
 * ```bash
 * # Step 1: Run tests with profiling
 * bun test --preload @zeitzeuge/bun/preload
 *
 * # Step 2: Analyze (can be combined with step 1 in a script)
 * bun -e "import { analyzeTestRun } from '@zeitzeuge/bun'; await analyzeTestRun();"
 * ```
 */

import { readdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import chalk from 'chalk';
import ora from 'ora';

import {
  computeMetrics,
  initModel,
  printFindingsVitest,
  printMetricsSummary,
  writeTestReport,
} from '@zeitzeuge/utils';

import { parseBunProfile } from './profile-adapter.js';
import { classifyScript } from './classify.js';
import { createTestWorkspace, analyzeTestPerformance } from '@zeitzeuge/utils';
import type { ZeitZeugeBunTestOptions } from './types.js';
import type { TestFileTiming, CorrelatedProfile, V8CpuProfile } from '@zeitzeuge/utils';

/**
 * Analyze a completed Bun test run.
 *
 * Reads CPU profiles from the profile directory, parses them, builds
 * a workspace, and runs the Deep Agent analysis pipeline.
 */
export async function analyzeTestRun(options: ZeitZeugeBunTestOptions = {}): Promise<void> {
  const {
    enabled = true,
    output = 'zeitzeuge-report.md',
    profileDir = '.zeitzeuge-profiles',
    analyzeOnFinish = true,
    verbose = false,
    projectRoot = process.cwd(),
  } = options;

  if (!enabled) return;

  const resolvedProfileDir = resolve(profileDir);
  const resolvedOutput = resolve(output);
  const resolvedProjectRoot = resolve(projectRoot);

  if (!existsSync(resolvedProfileDir)) {
    console.log(
      chalk.yellow('[zeitzeuge] No profile directory found. Run bun test with --cpu-prof first.'),
    );
    return;
  }

  const allFiles = readdirSync(resolvedProfileDir);

  // Collect timing data from preload script
  const testTiming = collectTimingData(resolvedProfileDir, allFiles, verbose);

  // Collect CPU profiles
  const profileFiles = allFiles
    .filter((f) => f.endsWith('.cpuprofile'))
    .map((f) => {
      const fullPath = join(resolvedProfileDir, f);
      try {
        const stat = statSync(fullPath);
        return { name: f, path: fullPath, lastModified: stat.mtimeMs, size: stat.size };
      } catch {
        return { name: f, path: fullPath, lastModified: 0, size: 0 };
      }
    });

  if (profileFiles.length === 0) {
    console.log(
      chalk.yellow(
        '[zeitzeuge] No .cpuprofile files found. Ensure --cpu-prof was passed to bun test.',
      ),
    );
    return;
  }

  console.log(chalk.cyan(`\n[zeitzeuge] ${profileFiles.length} CPU profile(s) collected`));

  const byMtime = [...profileFiles].sort((a, b) => a.lastModified - b.lastModified);
  const orderedTestFiles = testTiming.map((t) => t.file);

  const PROFILE_ANALYSIS_CAP = 10;
  const candidates = byMtime.map((pf, i) => ({
    ...pf,
    testFile: orderedTestFiles[i] ?? `unknown-${i}`,
  }));

  const toParse =
    candidates.length <= PROFILE_ANALYSIS_CAP + 5
      ? candidates
      : [...candidates].sort((a, b) => b.size - a.size).slice(0, PROFILE_ANALYSIS_CAP + 5);

  const profiles: CorrelatedProfile[] = [];
  const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));

  for (const pf of toParse) {
    try {
      const content = readFileSync(pf.path, 'utf-8');
      const rawProfile: V8CpuProfile = JSON.parse(content);
      const summary = parseBunProfile(rawProfile, pf.path);

      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, resolvedProjectRoot, testFileSet);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, resolvedProjectRoot, testFileSet);
      }

      profiles.push({ testFile: pf.testFile, profilePath: pf.path, summary });
    } catch (err) {
      if (verbose) {
        console.warn(
          `[zeitzeuge] Failed to parse profile ${pf.name}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  profiles.sort((a, b) => b.summary.duration - a.summary.duration);
  const topProfiles = profiles.slice(0, PROFILE_ANALYSIS_CAP);

  if (topProfiles.length === 0) {
    console.log(chalk.yellow('[zeitzeuge] No profiles could be parsed'));
    return;
  }

  const metrics = computeMetrics(testTiming, topProfiles, [], resolvedProjectRoot);

  console.log(chalk.cyan('\nzeitzeuge: Performance Metrics\n'));
  printMetricsSummary(metrics);

  if (!analyzeOnFinish) return;

  const testSources = readTestSources(testTiming);
  const sourcePaths = readHotFunctionSources(topProfiles);

  const workspace = await createTestWorkspace({
    testTiming,
    profiles: topProfiles,
    testSources,
    sourcePaths,
    projectRoot: resolvedProjectRoot,
    metrics,
  });

  try {
    const model = await initModel();
    const spinner = ora({
      text: 'zeitzeuge: Analyzing test performance...',
      isEnabled: false,
    }).start();

    const findings = await analyzeTestPerformance(
      model,
      workspace.backend,
      spinner,
      {
        metrics,
        hasHeapProfiles: false,
        hasListenerTracking: false,
        sourceFiles: workspace.sourceFiles,
        testFiles: workspace.testFiles,
      },
      { animateProgress: false },
    );

    spinner.stop();

    console.log(chalk.cyan('\nzeitzeuge: Performance Analysis\n'));
    printFindingsVitest(findings);

    const reportPath = writeTestReport(resolvedOutput, {
      version: '0.1.0',
      findings,
      testTiming,
      profiles: topProfiles,
      metrics,
    });
    console.log(chalk.dim(`\n  Report written to ${reportPath}\n`));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    if (message.includes('API key')) {
      console.log(
        chalk.yellow('[zeitzeuge] No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.'),
      );
    } else {
      console.error(chalk.red(`[zeitzeuge] Analysis failed: ${message}`));
    }
  } finally {
    workspace.cleanup();
    try {
      rmSync(resolvedProfileDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  }
}

function collectTimingData(
  profileDir: string,
  allFiles: string[],
  verbose: boolean,
): TestFileTiming[] {
  const timingFiles = allFiles.filter((f) => f.startsWith('bun-timing-') && f.endsWith('.json'));
  const results: TestFileTiming[] = [];

  for (const file of timingFiles) {
    try {
      const content = readFileSync(join(profileDir, file), 'utf-8');
      const data = JSON.parse(content);
      if (data.files && Array.isArray(data.files)) {
        for (const f of data.files) {
          results.push({
            file: f.file,
            duration: f.duration ?? 0,
            testCount: f.tests?.length ?? 0,
            passCount: f.tests?.filter((t: any) => t.status === 'pass').length ?? 0,
            failCount: f.tests?.filter((t: any) => t.status === 'fail').length ?? 0,
            setupTime: 0,
            tests: f.tests ?? [],
          });
        }
      }
    } catch (err) {
      if (verbose) {
        console.warn(
          `[zeitzeuge] Failed to parse timing file ${file}: ${err instanceof Error ? err.message : err}`,
        );
      }
    }
  }

  return results;
}

function readTestSources(testTiming: TestFileTiming[]): Map<string, string> {
  const sources = new Map<string, string>();
  for (const timing of testTiming) {
    try {
      const resolvedPath = resolve(timing.file);
      if (existsSync(resolvedPath)) {
        sources.set(timing.file, readFileSync(resolvedPath, 'utf-8'));
      }
    } catch {
      // skip
    }
  }
  return sources;
}

function readHotFunctionSources(profiles: CorrelatedProfile[]): Map<string, string> {
  const sources = new Map<string, string>();
  const seen = new Set<string>();

  for (const profile of profiles) {
    for (const fn of profile.summary.hotFunctions) {
      if (!fn.scriptUrl || seen.has(fn.scriptUrl)) continue;

      const threshold = fn.sourceCategory === 'application' ? 0.1 : 1;
      if (fn.selfPercent < threshold) continue;

      seen.add(fn.scriptUrl);
      try {
        let filePath = fn.scriptUrl;
        if (filePath.startsWith('file://')) {
          filePath = new URL(filePath).pathname;
        }
        if (existsSync(filePath)) {
          sources.set(fn.scriptUrl, readFileSync(filePath, 'utf-8'));
        }
      } catch {
        // skip
      }
    }
  }

  return sources;
}
