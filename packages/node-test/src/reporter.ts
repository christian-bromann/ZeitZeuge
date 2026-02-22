/**
 * Custom reporter for `node --test` that collects V8 CPU profiles
 * and triggers zeitzeuge performance analysis after tests complete.
 *
 * Usage:
 *   node --test \
 *     --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \
 *     --test-reporter @zeitzeuge/node-test/reporter \
 *     --test-reporter-destination stdout \
 *     tests/*.test.js
 *
 * The reporter consumes the TestEvent stream from node:test, extracts
 * timing information from test:pass / test:fail / test:diagnostic events,
 * and runs the full zeitzeuge analysis pipeline (profile parsing →
 * classification → workspace → Deep Agent) after the test:summary event.
 */

import { readdirSync, readFileSync, existsSync, rmSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';

import type { TestFileTiming, CorrelatedProfile } from '@zeitzeuge/utils';
import type { V8CpuProfile } from './types.js';

/** Shape of node:test TestEvent objects. */
interface TestEvent {
  type: string;
  data: {
    name?: string;
    file?: string;
    nesting?: number;
    details?: {
      duration_ms?: number;
      error?: Error;
      passed?: boolean;
      type?: string;
    };
    skip?: string | boolean;
    todo?: string | boolean;
    message?: string;
    count?: number;
    line?: number;
    column?: number;
    success?: boolean;
    counts?: {
      passed?: number;
      failed?: number;
      cancelled?: number;
      skipped?: number;
      todo?: number;
      topLevel?: number;
      suites?: number;
      tests?: number;
    };
  };
}

interface FileTimingAccumulator {
  file: string;
  tests: Array<{
    name: string;
    duration: number;
    status: 'pass' | 'fail' | 'skip';
  }>;
  totalDuration: number;
}

/**
 * Async generator reporter for `node --test`.
 *
 * This is the default export — node:test will call it with a ReadableStream
 * of TestEvent objects when used via `--test-reporter`.
 */
export default async function* zeitZeugeReporter(
  source: AsyncIterable<TestEvent>,
): AsyncGenerator<string> {
  const profileDir = process.env.ZEITZEUGE_PROFILE_DIR || '.zeitzeuge-profiles';
  const output = process.env.ZEITZEUGE_OUTPUT || 'zeitzeuge-report.md';
  const projectRoot = process.env.ZEITZEUGE_PROJECT_ROOT || process.cwd();
  const verbose = process.env.ZEITZEUGE_VERBOSE === 'true';
  const analyzeOnFinish = process.env.ZEITZEUGE_ANALYZE !== 'false';

  const fileTimings = new Map<string, FileTimingAccumulator>();

  for await (const event of source) {
    switch (event.type) {
      case 'test:pass':
      case 'test:fail': {
        const file = event.data.file ?? '';
        const name = event.data.name ?? '';
        const duration = event.data.details?.duration_ms ?? 0;
        const nesting = event.data.nesting ?? 0;

        if (nesting === 0 && file) {
          let acc = fileTimings.get(file);
          if (!acc) {
            acc = { file, tests: [], totalDuration: 0 };
            fileTimings.set(file, acc);
          }

          if (event.data.details?.type === 'suite') {
            acc.totalDuration = duration;
          } else {
            acc.tests.push({
              name,
              duration,
              status: event.type === 'test:pass' ? 'pass' : 'fail',
            });
          }
        } else if (nesting > 0 && file) {
          let acc = fileTimings.get(file);
          if (!acc) {
            acc = { file, tests: [], totalDuration: 0 };
            fileTimings.set(file, acc);
          }
          acc.tests.push({
            name,
            duration,
            status: event.type === 'test:pass' ? 'pass' : 'fail',
          });
        }

        const icon = event.type === 'test:pass' ? '\u2713' : '\u2717';
        yield `${icon} ${name} (${duration.toFixed(1)}ms)\n`;
        break;
      }

      case 'test:diagnostic': {
        if (verbose) {
          yield `# ${event.data.message}\n`;
        }
        break;
      }

      case 'test:summary': {
        const counts = event.data.counts;
        yield `\n# Summary: ${counts?.passed ?? 0} passed, ${counts?.failed ?? 0} failed\n`;

        if (!analyzeOnFinish) break;

        const testTiming = buildTestTiming(fileTimings);
        if (testTiming.length === 0) {
          yield '# zeitzeuge: No test timing data collected\n';
          break;
        }

        try {
          const analysisOutput = await runAnalysis({
            testTiming,
            profileDir: resolve(profileDir),
            output: resolve(output),
            projectRoot: resolve(projectRoot),
            verbose,
          });
          yield analysisOutput;
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          yield `# zeitzeuge: Analysis failed — ${msg}\n`;
        } finally {
          try {
            if (existsSync(resolve(profileDir))) {
              rmSync(resolve(profileDir), { recursive: true, force: true });
            }
          } catch {
            // ignore cleanup errors
          }
        }
        break;
      }
    }
  }
}

function buildTestTiming(fileTimings: Map<string, FileTimingAccumulator>): TestFileTiming[] {
  const results: TestFileTiming[] = [];

  for (const acc of fileTimings.values()) {
    let passCount = 0;
    let failCount = 0;
    for (const t of acc.tests) {
      if (t.status === 'pass') passCount++;
      else if (t.status === 'fail') failCount++;
    }

    const duration = acc.totalDuration || acc.tests.reduce((s, t) => s + t.duration, 0);

    results.push({
      file: acc.file,
      duration,
      testCount: acc.tests.length,
      passCount,
      failCount,
      setupTime: 0,
      tests: acc.tests,
    });
  }

  return results;
}

async function runAnalysis(opts: {
  testTiming: TestFileTiming[];
  profileDir: string;
  output: string;
  projectRoot: string;
  verbose: boolean;
}): Promise<string> {
  const { testTiming, profileDir, output, projectRoot, verbose } = opts;
  const lines: string[] = [];

  if (!existsSync(profileDir)) {
    return '# zeitzeuge: No profile directory found. Run with --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles\n';
  }

  const allFiles = readdirSync(profileDir);
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
    return '# zeitzeuge: No .cpuprofile files found. Ensure --cpu-prof is passed to test processes.\n';
  }

  lines.push(`\n# zeitzeuge: ${profileFiles.length} CPU profile(s) collected\n`);

  // Lazy-import the heavy analysis modules (profile parser, workspace, agent, etc.)
  // These are re-exported from the main index for programmatic use.
  const { parseCpuProfile } = await import('./profile-parser.js');
  const { classifyScript } = await import('./classify.js');
  const { computeMetrics } = await import('./metrics.js');
  const { initModel, printMetricsSummary, printFindingsVitest, writeTestReport } =
    await import('@zeitzeuge/utils');
  const { createNodeTestWorkspace } = await import('./workspace.js');
  const { analyzeTestPerformance } = await import('./agent.js');
  const ora = (await import('ora')).default;

  const byMtime = [...profileFiles].sort((a, b) => a.lastModified - b.lastModified);
  const orderedTestFiles = testTiming.map((t) => t.file);

  const PROFILE_ANALYSIS_CAP = 10;
  const PROFILE_PARSE_BUDGET = Math.min(byMtime.length, PROFILE_ANALYSIS_CAP + 5);
  const toParse =
    byMtime.length <= PROFILE_PARSE_BUDGET
      ? byMtime.map((pf, i) => ({ ...pf, testFile: orderedTestFiles[i] ?? `unknown-${i}` }))
      : [...byMtime]
          .map((pf, i) => ({ ...pf, testFile: orderedTestFiles[i] ?? `unknown-${i}` }))
          .sort((a, b) => b.size - a.size)
          .slice(0, PROFILE_PARSE_BUDGET);

  const profiles: CorrelatedProfile[] = [];
  const testFileSet = new Set(testTiming.map((t) => resolve(t.file)));

  for (const pf of toParse) {
    try {
      const content = readFileSync(pf.path, 'utf-8');
      const rawProfile: V8CpuProfile = JSON.parse(content);
      const summary = parseCpuProfile(rawProfile, pf.path);

      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, projectRoot, testFileSet);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, projectRoot, testFileSet);
      }

      profiles.push({ testFile: pf.testFile, profilePath: pf.path, summary });
    } catch (err) {
      if (verbose) {
        lines.push(
          `# zeitzeuge: Failed to parse ${pf.name}: ${err instanceof Error ? err.message : err}\n`,
        );
      }
    }
  }

  profiles.sort((a, b) => b.summary.duration - a.summary.duration);
  const topProfiles = profiles.slice(0, PROFILE_ANALYSIS_CAP);

  if (topProfiles.length === 0) {
    return lines.join('') + '# zeitzeuge: No profiles could be parsed\n';
  }

  const metrics = computeMetrics(testTiming, topProfiles, [], projectRoot);
  printMetricsSummary(metrics);

  const testSources = readTestSources(testTiming);
  const sourcePaths = readHotFunctionSources(topProfiles, projectRoot);

  const workspace = await createNodeTestWorkspace({
    testTiming,
    profiles: topProfiles,
    testSources,
    sourcePaths,
    projectRoot,
    metrics,
  });

  try {
    const model = await initModel();
    const spinner = ora({ text: 'zeitzeuge: Analyzing...', isEnabled: false }).start();
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

    printFindingsVitest(findings);

    const reportPath = writeTestReport(output, {
      version: '0.1.0',
      findings,
      testTiming,
      profiles: topProfiles,
      metrics,
    });
    lines.push(`\n# zeitzeuge: Report written to ${reportPath}\n`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes('API key')) {
      lines.push('# zeitzeuge: No LLM API key found. Set OPENAI_API_KEY or ANTHROPIC_API_KEY.\n');
    } else {
      lines.push(`# zeitzeuge: Analysis failed — ${msg}\n`);
    }
  } finally {
    workspace.cleanup();
  }

  return lines.join('');
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

function readHotFunctionSources(
  profiles: CorrelatedProfile[],
  _projectRoot: string,
): Map<string, string> {
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
