/**
 * Vitest Reporter that collects CPU profiles after a test run,
 * builds a workspace, and runs Deep Agent analysis.
 */

import { readdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import chalk from 'chalk';
import ora from 'ora';

import { parseCpuProfile } from './profile-parser.js';
import { parseHeapProfile } from './heap-profile-parser.js';
import { createVitestWorkspace } from './workspace.js';
import { initModel } from '../models/init.js';
import { printFindingsVitest } from '../output/terminal.js';
import { writeTestReport } from '../output/report.js';
import { classifyScript } from './classify.js';
import type {
  TestFileTiming,
  CorrelatedProfile,
  CorrelatedHeapProfile,
  V8CpuProfile,
  V8HeapProfile,
} from './types.js';

import pkg from '../../package.json';

export interface ReporterOptions {
  output: string;
  profileDir: string;
  analyzeOnFinish: boolean;
  verbose: boolean;
  /** Absolute path to the project root for source classification. */
  projectRoot: string;
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

  /** Whether we're running in CI (suppress spinners). */
  private isCI = !!process.env.CI;

  constructor(options: ReporterOptions) {
    this.options = options;
  }

  /**
   * Called when a test module starts executing.
   * Records execution order for profile correlation.
   */
  onTestModuleStart(testModule: any): void {
    const filePath = testModule?.moduleId ?? testModule?.id ?? '';
    if (filePath && !this.executionOrder.includes(filePath)) {
      this.executionOrder.push(filePath);
    }
  }

  /**
   * Called after all tests finish. This is the main orchestration method.
   */
  async onTestRunEnd(testModules: ReadonlyArray<any>): Promise<void> {
    try {
      await this.runAnalysis(testModules);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(chalk.red(`\n[zeitzeuge] Analysis failed: ${message}\n`));
      if (this.options.verbose && err instanceof Error) {
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
    const spinner = this.isCI
      ? null
      : ora({ text: 'zeitzeuge: Collecting CPU profiles...', color: 'cyan' }).start();

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

    // 3. Read test source files
    const testSources = this.readTestSources(testTiming);

    // 4. Read source files referenced by hot functions
    const sourcePaths = this.readHotFunctionSources(profiles);

    // 5. Build workspace
    const wsSpinner = this.isCI
      ? null
      : ora({ text: 'zeitzeuge: Building analysis workspace...', color: 'cyan' }).start();

    const workspace = await createVitestWorkspace({
      testTiming,
      profiles,
      heapProfiles,
      testSources,
      sourcePaths,
      projectRoot: this.options.projectRoot,
    });

    wsSpinner?.succeed('zeitzeuge: Workspace ready');

    // 6. Run Deep Agent analysis
    if (this.options.analyzeOnFinish) {
      const agentSpinner = ora({
        text: 'zeitzeuge: Deep Agent analyzing test performance...',
        color: 'cyan',
        isEnabled: !this.isCI,
      }).start();

      try {
        const model = initModel();
        const { analyzeTestPerformance } = await import('../analysis/agent.js');
        const findings = await analyzeTestPerformance(model, workspace.backend, agentSpinner);

        agentSpinner.succeed(`zeitzeuge: Analysis complete — ${findings.length} finding(s)`);

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
        });
        console.log(chalk.dim(`\n  Report written to ${reportPath}\n`));
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);

        // Check if it's a missing API key error
        if (
          message.includes('API key') ||
          message.includes('OPENAI_API_KEY') ||
          message.includes('ANTHROPIC_API_KEY')
        ) {
          agentSpinner.warn(
            'zeitzeuge: No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY for AI-powered analysis.',
          );
        } else {
          agentSpinner.fail(`zeitzeuge: Analysis failed — ${message}`);
          throw err;
        }
      } finally {
        workspace.cleanup();
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
        results.push({
          name: child.fullName ?? child.name ?? '',
          duration: diagnostic?.duration ?? 0,
          status:
            child.result?.state === 'passed'
              ? 'pass'
              : child.result?.state === 'failed'
                ? 'fail'
                : 'skip',
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

    // Find all .cpuprofile files, sorted by modification time
    const profileFiles = allFiles
      .filter((f) => f.endsWith('.cpuprofile'))
      .map((f) => {
        const fullPath = join(profileDir, f);
        try {
          const stat = statSync(fullPath);
          return { name: f, path: fullPath, lastModified: stat.mtimeMs };
        } catch {
          return { name: f, path: fullPath, lastModified: 0 };
        }
      })
      .sort((a, b) => a.lastModified - b.lastModified);

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

    const results: CorrelatedProfile[] = [];

    // Strategy: Match profiles to test files by execution order
    // Use executionOrder if available, otherwise use testTiming order
    const orderedTestFiles =
      this.executionOrder.length > 0 ? this.executionOrder : testTiming.map((t) => t.file);

    for (let i = 0; i < profileFiles.length; i++) {
      const pf = profileFiles[i]!;
      const testFile = orderedTestFiles[i] ?? `unknown-${i}`;

      try {
        const content = readFileSync(pf.path, 'utf-8');
        const rawProfile: V8CpuProfile = JSON.parse(content);
        const summary = parseCpuProfile(rawProfile, pf.path);

        // Classify each hot function and script by source category
        const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));
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
          testFile,
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

    // Limit to the 10 slowest profiles for analysis
    results.sort((a, b) => b.summary.duration - a.summary.duration);
    return results.slice(0, 10);
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
          return { name: f, path: fullPath, lastModified: stat.mtimeMs };
        } catch {
          return { name: f, path: fullPath, lastModified: 0 };
        }
      })
      .sort((a, b) => a.lastModified - b.lastModified);

    if (heapFiles.length === 0) {
      return [];
    }

    const orderedTestFiles =
      this.executionOrder.length > 0 ? this.executionOrder : testTiming.map((t) => t.file);

    const results: CorrelatedHeapProfile[] = [];
    const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));

    for (let i = 0; i < heapFiles.length; i++) {
      const hf = heapFiles[i]!;
      const testFile = orderedTestFiles[i] ?? `unknown-${i}`;

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
          testFile,
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

    // Keep at most 10 (mirrors CPU profile cap)
    return results.slice(0, 10);
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
