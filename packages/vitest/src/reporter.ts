/**
 * Vitest Reporter that collects CPU profiles after a test run,
 * builds a workspace, and runs Deep Agent analysis.
 */

import { readdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import chalk from 'chalk';
import ora, { type Ora } from 'ora';

import { parseCpuProfile } from './profile-parser.js';
import { parseHeapProfile } from './heap-profile-parser.js';
import { createVitestWorkspace } from './workspace.js';
import {
  initModel,
  printFindingsVitest,
  printMetricsSummary,
  analyzeTestPerformance,
  writeTestReport,
} from '@zeitzeuge/utils';
import { classifyScript } from './classify.js';
import { VITEST_SYSTEM_PROMPT } from './prompts.js';
import { computeMetrics } from './metrics.js';
import {
  aggregateListenerTracking,
  getListenerImbalances,
  LISTENER_TRACKING_JSONL,
  type RawListenerTrackingData,
  type EventListenerTracking,
} from './listener-tracker.js';
import type {
  TestFileTiming,
  CorrelatedProfile,
  CorrelatedHeapProfile,
  V8CpuProfile,
  V8HeapProfile,
} from './types.js';

import pkg from '../package.json';

export interface ReporterOptions {
  output: string;
  profileDir: string;
  analyzeOnFinish: boolean;
  verbose: boolean;
  /** Absolute path to the project root for source classification. */
  projectRoot: string;
  /** Optional Vitest project name (workspaces) to scope this reporter. */
  projectName?: string;
}

type OraLockState = { activeAnimatedSpinners: number };
const ORA_LOCK_KEY = Symbol.for('zeitzeuge.ora.lock');

function getOraLock(): OraLockState {
  const g = globalThis as unknown as { [ORA_LOCK_KEY]?: OraLockState };
  if (!g[ORA_LOCK_KEY]) g[ORA_LOCK_KEY] = { activeAnimatedSpinners: 0 };
  return g[ORA_LOCK_KEY]!;
}

/**
 * Create an ora spinner that won't conflict with other concurrent runs.
 *
 * ora prints a warning when multiple animated spinners run at once. In Vitest
 * workspaces, multiple projects can finish in parallel and each reporter
 * may try to start spinners.
 *
 * We allow only ONE animated spinner at a time; additional spinners are created
 * with `isEnabled: false` (they still support the Ora API used by our progress UI).
 */
function createSafeSpinner(options: { text: string; color?: 'cyan' }): Ora {
  const lock = getOraLock();
  const canAnimate = lock.activeAnimatedSpinners === 0;
  if (canAnimate) lock.activeAnimatedSpinners += 1;

  const spinner = ora({
    text: options.text,
    color: options.color ?? 'cyan',
    isEnabled: canAnimate,
  }).start();

  if (!canAnimate) return spinner;

  let released = false;
  const releaseOnce = () => {
    if (released) return;
    released = true;
    const l = getOraLock();
    l.activeAnimatedSpinners = Math.max(0, l.activeAnimatedSpinners - 1);
  };

  // Release when the spinner is terminally stopped.
  const origStop = spinner.stop.bind(spinner);
  const origSucceed = spinner.succeed.bind(spinner);
  const origFail = spinner.fail.bind(spinner);
  const origWarn = spinner.warn.bind(spinner);

  spinner.stop = () => {
    releaseOnce();
    return origStop();
  };
  spinner.succeed = (text?: string) => {
    releaseOnce();
    return origSucceed(text);
  };
  spinner.fail = (text?: string) => {
    releaseOnce();
    return origFail(text);
  };
  spinner.warn = (text?: string) => {
    releaseOnce();
    return origWarn(text);
  };

  return spinner;
}

/**
 * ZeitZeugeReporter implements the Vitest Reporter interface.
 *
 * It records test module execution order to correlate PID-named
 * .cpuprofile files with their corresponding test files.
 */
export class ZeitZeugeReporter {
  private options: ReporterOptions;

  /** Ordered list of test file paths as they started executing. */
  private executionOrder: string[] = [];

  /** Whether we're running in CI or via Bun (suppress animated spinners).
   *
   * `bun run` relays child-process stdout through a pseudo-TTY that
   * doesn't properly handle the ANSI cursor-repositioning `ora` relies
   * on, so every spinner frame is appended instead of overwriting the
   * previous one.  We detect Bun via the `npm_config_user_agent` env
   * var that `bun run` injects into child processes.
   */
  private suppressSpinners =
    !!process.env.CI || !!process.env.npm_config_user_agent?.startsWith('bun');

  constructor(options: ReporterOptions) {
    this.options = options;
  }

  private moduleBelongsToProject(testModule: any): boolean {
    const expected = this.options.projectName;
    if (!expected) return true;

    const actual = testModule?.project?.name ? String(testModule.project.name) : undefined;
    // If Vitest doesn't provide project info, don't accidentally drop modules.
    if (!actual) return true;
    return actual === expected;
  }

  /**
   * Called when a test module starts executing.
   * Records execution order for profile correlation.
   */
  onTestModuleStart(testModule: any): void {
    if (!this.moduleBelongsToProject(testModule)) return;
    const filePath = testModule?.moduleId ?? testModule?.id ?? '';
    if (filePath && !this.executionOrder.includes(filePath)) {
      this.executionOrder.push(filePath);
    }
  }

  /**
   * Called after all tests finish. This is the main orchestration method.
   */
  async onTestRunEnd(testModules: ReadonlyArray<any>): Promise<void> {
    const scopedModules = Array.from(testModules ?? []).filter((m) =>
      this.moduleBelongsToProject(m),
    );
    if (scopedModules.length === 0) {
      // In Vitest workspaces, multiple reporters can be registered globally.
      // If this reporter doesn't have any modules for its project, do nothing.
      return;
    }

    try {
      await this.runAnalysis(scopedModules);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : (JSON.stringify(err, null, 2) ?? 'Unknown error');
      console.error(chalk.red(`\n[zeitzeuge] Analysis failed: ${message}\n`));
      if (err instanceof Error && err.stack) {
        console.error(err.stack);
      }
    } finally {
      this.cleanupProfileDir();
    }
  }

  // ── Private implementation ──────────────────────────────────

  private async runAnalysis(testModules: ReadonlyArray<any>): Promise<void> {
    // 1. Collect test timing
    const testTiming = this.collectTestTiming(testModules);
    if (testTiming.length === 0) {
      if (this.options.verbose) {
        console.log('[zeitzeuge] No test modules found, skipping analysis.');
      }
      return;
    }

    // 2. Collect and parse profiles
    const spinner = this.suppressSpinners
      ? null
      : createSafeSpinner({ text: 'zeitzeuge: Collecting CPU profiles...', color: 'cyan' });

    const profiles = this.collectAndParseProfiles(testTiming);
    const heapProfiles = this.collectAndParseHeapProfiles(testTiming);

    if (profiles.length === 0) {
      spinner?.warn(
        'zeitzeuge: No .cpuprofile files found. ' +
          'Try running with { verbose: true } for diagnostics.',
      );
      return;
    }

    spinner?.succeed(`zeitzeuge: ${profiles.length} CPU profile(s) collected`);
    if (this.options.verbose && heapProfiles.length > 0) {
      console.log(`[zeitzeuge] ${heapProfiles.length} heap profile(s) collected`);
    }

    // 3. Collect event listener tracking data from worker processes
    const listenerTracking = this.collectListenerTracking();
    if (this.options.verbose && listenerTracking) {
      const excCount = listenerTracking.exceedances.length;
      const etCount = Object.keys(listenerTracking.eventTargetCounts).length;
      console.log(
        `[zeitzeuge] Listener tracking: ${etCount} EventTarget event type(s), ` +
          `${excCount} exceedance(s)`,
      );
    }

    // 4. Compute performance metrics
    const metrics = computeMetrics(
      testTiming,
      profiles,
      heapProfiles,
      this.options.projectRoot,
      listenerTracking,
    );

    // 5. Print performance metrics summary
    console.log(chalk.cyan(`\nzeitzeuge: Performance Metrics\n`));
    printMetricsSummary(metrics);

    // 6. Read test source files
    const testSources = this.readTestSources(testTiming);

    // 7. Read source files referenced by hot functions
    const sourcePaths = this.readHotFunctionSources(profiles);

    // 8. Build workspace
    const wsSpinner = this.suppressSpinners
      ? null
      : createSafeSpinner({ text: 'zeitzeuge: Building analysis workspace...', color: 'cyan' });

    const workspace = await createVitestWorkspace({
      testTiming,
      profiles,
      heapProfiles,
      testSources,
      sourcePaths,
      projectRoot: this.options.projectRoot,
      metrics,
      listenerTracking,
    });

    wsSpinner?.succeed('zeitzeuge: Workspace ready');

    // 9. Run Deep Agent analysis
    if (this.options.analyzeOnFinish) {
      const agentSpinner = this.suppressSpinners
        ? null
        : createSafeSpinner({ text: 'zeitzeuge: Analyzing test performance...', color: 'cyan' });
      const spinnerForAgent =
        agentSpinner ??
        ora({ text: 'zeitzeuge: Analyzing test performance...', isEnabled: false }).start();

      try {
        const model = initModel();
        const findings = await analyzeTestPerformance(
          model,
          workspace.backend,
          spinnerForAgent,
          VITEST_SYSTEM_PROMPT,
          {
            metrics,
            hasHeapProfiles: heapProfiles.length > 0,
            hasListenerTracking: !!listenerTracking,
          },
          { animateProgress: !this.suppressSpinners },
        );

        agentSpinner?.succeed(`zeitzeuge: Analysis complete — ${findings.length} finding(s)`);

        // Print findings
        console.log(chalk.cyan(`\nzeitzeuge: Performance Analysis\n`));
        printFindingsVitest(findings);

        // Write report
        const version = this.getVersion();
        const reportPath = writeTestReport(this.options.output, {
          version,
          findings,
          testTiming,
          profiles,
          metrics,
        });
        console.log(chalk.dim(`\n  Report written to ${reportPath}\n`));
      } catch (err) {
        const message =
          err instanceof Error ? err.message : (JSON.stringify(err, null, 2) ?? 'Unknown error');

        // Check if it's a missing API key error
        if (
          message.includes('API key') ||
          message.includes('OPENAI_API_KEY') ||
          message.includes('ANTHROPIC_API_KEY')
        ) {
          agentSpinner?.warn(
            'zeitzeuge: No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for AI-powered analysis.',
          );
        } else {
          agentSpinner?.fail(`zeitzeuge: Analysis failed — ${message}`);
          if (err instanceof Error && err.stack) {
            console.error(err.stack);
          }
          throw err;
        }
      } finally {
        workspace.cleanup();
        spinnerForAgent.stop();
      }
    } else {
      workspace.cleanup();
    }
  }

  /**
   * Extract test timing data from Vitest TestModule objects.
   */
  private collectTestTiming(testModules: ReadonlyArray<any>): TestFileTiming[] {
    const results: TestFileTiming[] = [];

    for (const mod of testModules) {
      const filePath = mod.moduleId ?? mod.id ?? '';
      if (!filePath) continue;

      const tests: TestFileTiming['tests'] = [];
      let passCount = 0;
      let failCount = 0;

      // Walk children to extract individual test results
      if (mod.children) {
        this.walkTestCases(mod.children, tests);
      }

      for (const t of tests) {
        if (t.status === 'pass') passCount++;
        else if (t.status === 'fail') failCount++;
      }

      // Get timing from diagnostic or children
      const diagnostic = typeof mod.diagnostic === 'function' ? mod.diagnostic() : mod.diagnostic;
      const duration = diagnostic?.duration ?? tests.reduce((s, t) => s + t.duration, 0);
      const setupTime = diagnostic?.setupDuration ?? 0;

      results.push({
        file: filePath,
        duration,
        testCount: tests.length,
        passCount,
        failCount,
        setupTime,
        tests,
      });
    }

    return results;
  }

  /**
   * Recursively walk test module children to extract test case results.
   */
  private walkTestCases(children: Iterable<any>, results: TestFileTiming['tests']): void {
    for (const child of children) {
      if (child.type === 'test' || child.type === 'case') {
        const diagnostic =
          typeof child.diagnostic === 'function' ? child.diagnostic() : child.diagnostic;
        // In Vitest 3.x+, result() is a method; in older versions it may be a property.
        const result = typeof child.result === 'function' ? child.result() : child.result;
        results.push({
          name: child.fullName ?? child.name ?? '',
          duration: diagnostic?.duration ?? 0,
          status:
            result?.state === 'passed' ? 'pass' : result?.state === 'failed' ? 'fail' : 'skip',
        });
      }

      // Recurse into suites
      if (child.children) {
        this.walkTestCases(child.children, results);
      }
    }
  }

  /**
   * Collect .cpuprofile files and correlate them with test files.
   *
   * Uses sequential execution order as the primary correlation strategy:
   * with fileParallelism: false, profiles are generated sequentially and
   * can be matched by creation timestamp order.
   */
  private collectAndParseProfiles(testTiming: TestFileTiming[]): CorrelatedProfile[] {
    const { profileDir } = this.options;

    if (!existsSync(profileDir)) {
      if (this.options.verbose) {
        console.log(`[zeitzeuge] Profile directory not found: ${profileDir}`);
      }
      return [];
    }

    // List all files in the profile directory for diagnostics
    const allFiles = readdirSync(profileDir);
    if (this.options.verbose) {
      console.log(
        `[zeitzeuge] Profile directory ${profileDir} contains ${allFiles.length} file(s): ${allFiles.join(', ') || '(empty)'}`,
      );
    }

    // Find all .cpuprofile files, collecting both mtime (for correlation)
    // and size (to pre-filter before expensive parsing).
    const profileFiles = allFiles
      .filter((f) => f.endsWith('.cpuprofile'))
      .map((f) => {
        const fullPath = join(profileDir, f);
        try {
          const stat = statSync(fullPath);
          return { name: f, path: fullPath, lastModified: stat.mtimeMs, size: stat.size };
        } catch {
          return { name: f, path: fullPath, lastModified: 0, size: 0 };
        }
      });

    if (profileFiles.length === 0) {
      if (this.options.verbose) {
        console.log(
          `[zeitzeuge] No .cpuprofile files in ${profileDir}. ` +
            `This usually means --cpu-prof wasn't passed to the worker process. ` +
            `Check that pool is set to 'forks' and execArgv includes '--cpu-prof'.`,
        );
      }
      return [];
    }

    // Strategy: Match profiles to test files by execution order.
    // Sort by mtime for correlation, then associate each with a test file.
    const byMtime = [...profileFiles].sort((a, b) => a.lastModified - b.lastModified);
    const orderedTestFiles =
      this.executionOrder.length > 0 ? this.executionOrder : testTiming.map((t) => t.file);

    const candidates = byMtime.map((pf, i) => ({
      ...pf,
      testFile: orderedTestFiles[i] ?? `unknown-${i}`,
    }));

    // Pre-filter: only read/parse the largest profiles by file size.
    // File size is an excellent proxy for profile duration (more samples
    // = bigger file = longer running test), so we can skip the majority
    // of small profiles before doing any expensive I/O or parsing.
    // We take a few more than we need (PROFILE_PARSE_BUDGET) to account
    // for edge cases where size doesn't perfectly correlate with duration.
    const PROFILE_ANALYSIS_CAP = 10;
    const PROFILE_PARSE_BUDGET = Math.min(candidates.length, PROFILE_ANALYSIS_CAP + 5);
    const toParse =
      candidates.length <= PROFILE_PARSE_BUDGET
        ? candidates
        : [...candidates].sort((a, b) => b.size - a.size).slice(0, PROFILE_PARSE_BUDGET);

    if (this.options.verbose && candidates.length > PROFILE_PARSE_BUDGET) {
      console.log(
        `[zeitzeuge] Pre-filtered ${candidates.length} profiles down to ${toParse.length} largest by file size (skipping ${candidates.length - toParse.length} small profiles)`,
      );
    }

    const results: CorrelatedProfile[] = [];
    const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));

    for (const pf of toParse) {
      try {
        const content = readFileSync(pf.path, 'utf-8');
        const rawProfile: V8CpuProfile = JSON.parse(content);
        const summary = parseCpuProfile(rawProfile, pf.path);

        // Classify each hot function and script by source category
        for (const fn of summary.hotFunctions) {
          fn.sourceCategory = classifyScript(fn.scriptUrl, this.options.projectRoot, testFileSet);
        }
        for (const script of summary.scriptBreakdown) {
          script.sourceCategory = classifyScript(
            script.scriptUrl,
            this.options.projectRoot,
            testFileSet,
          );
        }

        results.push({
          testFile: pf.testFile,
          profilePath: pf.path,
          summary,
        });
      } catch (err) {
        if (this.options.verbose) {
          console.warn(
            `[zeitzeuge] Failed to parse profile ${pf.name}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    // Limit to the slowest profiles for analysis
    results.sort((a, b) => b.summary.duration - a.summary.duration);
    return results.slice(0, PROFILE_ANALYSIS_CAP);
  }

  /**
   * Collect .heapprofile files (from --heap-prof) and correlate them with test files.
   *
   * Uses the same timestamp-order correlation strategy as CPU profiles.
   */
  private collectAndParseHeapProfiles(testTiming: TestFileTiming[]): CorrelatedHeapProfile[] {
    const { profileDir } = this.options;

    if (!existsSync(profileDir)) {
      return [];
    }

    const allFiles = readdirSync(profileDir);
    const heapFiles = allFiles
      .filter((f) => f.endsWith('.heapprofile'))
      .map((f) => {
        const fullPath = join(profileDir, f);
        try {
          const stat = statSync(fullPath);
          return { name: f, path: fullPath, lastModified: stat.mtimeMs, size: stat.size };
        } catch {
          return { name: f, path: fullPath, lastModified: 0, size: 0 };
        }
      });

    if (heapFiles.length === 0) {
      return [];
    }

    // Correlate by mtime order, then pre-filter by size (same strategy as CPU profiles)
    const byMtime = [...heapFiles].sort((a, b) => a.lastModified - b.lastModified);
    const orderedTestFiles =
      this.executionOrder.length > 0 ? this.executionOrder : testTiming.map((t) => t.file);

    const candidates = byMtime.map((hf, i) => ({
      ...hf,
      testFile: orderedTestFiles[i] ?? `unknown-${i}`,
    }));

    const HEAP_ANALYSIS_CAP = 10;
    const HEAP_PARSE_BUDGET = Math.min(candidates.length, HEAP_ANALYSIS_CAP + 5);
    const toParse =
      candidates.length <= HEAP_PARSE_BUDGET
        ? candidates
        : [...candidates].sort((a, b) => b.size - a.size).slice(0, HEAP_PARSE_BUDGET);

    const results: CorrelatedHeapProfile[] = [];
    const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));

    for (const hf of toParse) {
      try {
        const content = readFileSync(hf.path, 'utf-8');
        const rawHeapProfile: V8HeapProfile = JSON.parse(content);
        const summary = parseHeapProfile(rawHeapProfile, hf.path);

        // Classify each allocation hotspot and script by source category
        for (const fn of summary.topAllocations) {
          fn.sourceCategory = classifyScript(fn.scriptUrl, this.options.projectRoot, testFileSet);
        }
        for (const script of summary.scriptBreakdown) {
          script.sourceCategory = classifyScript(
            script.scriptUrl,
            this.options.projectRoot,
            testFileSet,
          );
        }

        results.push({
          testFile: hf.testFile,
          profilePath: hf.path,
          summary,
        });
      } catch (err) {
        if (this.options.verbose) {
          console.warn(
            `[zeitzeuge] Failed to parse heap profile ${hf.name}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    }

    // Keep at most the cap (sorted by total allocation size)
    return results.slice(0, HEAP_ANALYSIS_CAP);
  }

  /**
   * Collect and aggregate event listener tracking data written by the
   * preload script in each worker process.
   *
   * Workers append one JSON line per process to a shared JSONL file
   * (`listener-tracking.jsonl`). This method reads the single file,
   * parses all entries, and aggregates them into a single summary.
   *
   * Falls back to reading individual `listener-tracking-<pid>.json` files
   * for backward compatibility with profiles generated by older versions.
   */
  private collectListenerTracking(): EventListenerTracking | undefined {
    const { profileDir } = this.options;

    if (!existsSync(profileDir)) {
      return undefined;
    }

    const entries: RawListenerTrackingData[] = [];

    // Prefer the combined JSONL file (one read instead of N).
    const jsonlPath = join(profileDir, LISTENER_TRACKING_JSONL);
    if (existsSync(jsonlPath)) {
      try {
        const content = readFileSync(jsonlPath, 'utf-8');
        for (const line of content.split('\n')) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          try {
            entries.push(JSON.parse(trimmed) as RawListenerTrackingData);
          } catch (err) {
            if (this.options.verbose) {
              console.warn(
                `[zeitzeuge] Failed to parse JSONL line in ${LISTENER_TRACKING_JSONL}: ${err instanceof Error ? err.message : err}`,
              );
            }
          }
        }
      } catch (err) {
        if (this.options.verbose) {
          console.warn(
            `[zeitzeuge] Failed to read ${LISTENER_TRACKING_JSONL}: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
    } else {
      // Fallback: read individual per-PID files (backward compat).
      const allFiles = readdirSync(profileDir);
      const trackingFiles = allFiles.filter((f) => f.startsWith('listener-tracking-'));

      for (const file of trackingFiles) {
        try {
          const content = readFileSync(join(profileDir, file), 'utf-8');
          const data: RawListenerTrackingData = JSON.parse(content);
          entries.push(data);
        } catch (err) {
          if (this.options.verbose) {
            console.warn(
              `[zeitzeuge] Failed to parse listener tracking ${file}: ${err instanceof Error ? err.message : err}`,
            );
          }
        }
      }
    }

    if (entries.length === 0) {
      return undefined;
    }

    const aggregated = aggregateListenerTracking(entries);

    // Only return if there's meaningful data (exceedances or notable imbalances)
    const hasExceedances = aggregated.exceedances.length > 0;
    const hasImbalances = getListenerImbalances(aggregated).length > 0;

    if (!hasExceedances && !hasImbalances) {
      return undefined;
    }

    return aggregated;
  }

  /**
   * Read test source files from disk.
   */
  private readTestSources(testTiming: TestFileTiming[]): Map<string, string> {
    const sources = new Map<string, string>();

    for (const timing of testTiming) {
      try {
        const resolvedPath = resolve(timing.file);
        if (existsSync(resolvedPath)) {
          sources.set(timing.file, readFileSync(resolvedPath, 'utf-8'));
        }
      } catch {
        // Skip files we can't read
      }
    }

    return sources;
  }

  /**
   * Read source files that appear in hot function profiles.
   *
   * Application code is included with a lower threshold (0.1%) to give
   * the agent more context about the code being tested. Dependency code
   * uses a higher threshold (1%) since we mainly need it for context.
   */
  private readHotFunctionSources(profiles: CorrelatedProfile[]): Map<string, string> {
    const sources = new Map<string, string>();
    const seen = new Set<string>();

    for (const profile of profiles) {
      for (const fn of profile.summary.hotFunctions) {
        if (!fn.scriptUrl || seen.has(fn.scriptUrl)) {
          continue;
        }

        // Application code: include with much lower threshold
        // Dependency code: include with standard threshold
        const threshold = fn.sourceCategory === 'application' ? 0.1 : 1;
        if (fn.selfPercent < threshold) continue;

        seen.add(fn.scriptUrl);

        try {
          // scriptUrl may be a file:// URL or absolute path
          let filePath = fn.scriptUrl;
          if (filePath.startsWith('file://')) {
            filePath = new URL(filePath).pathname;
          }

          if (existsSync(filePath)) {
            sources.set(fn.scriptUrl, readFileSync(filePath, 'utf-8'));
          }
        } catch {
          // Skip files we can't read
        }
      }
    }

    return sources;
  }

  /**
   * Clean up the profile directory.
   */
  private cleanupProfileDir(): void {
    try {
      if (existsSync(this.options.profileDir)) {
        rmSync(this.options.profileDir, { recursive: true, force: true });
      }
    } catch {
      // Ignore cleanup errors
    }
  }

  /**
   * Get package version.
   */
  private getVersion(): string {
    return pkg.version ?? '(unknown)';
  }
}
