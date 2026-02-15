/**
 * End-to-end test for the Vitest integration analysis pipeline.
 *
 * Generates real V8 CPU profiles by running fixture application code
 * with `node --cpu-prof`, then feeds the profiles through the full
 * zeitzeuge pipeline (parser → classifier → workspace builder) and
 * validates that each type of performance issue is detected.
 *
 * The fixture code uses realistic, non-descriptive function names
 * to ensure the pipeline detects issues from profiling data — not
 * by reading function names.
 *
 * Issues embedded in the fixture:
 *   1. Excessive per-item object allocation   (buildUserIndex)
 *   2. Accumulating event listeners           (setupMetricsCollector)
 *   3. O(n²) CPU-bound computation            (computeCorrelationMatrix)
 *   4. O(n²) deduplication with .includes()   (deduplicateRecords)
 *   5. Repeated JSON round-trips              (normalizePayload)
 */

import { test, expect, describe, beforeAll, afterAll } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { parseCpuProfile } from '../../src/profile-parser.js';
import { classifyScript } from '../../src/classify.js';
import { createVitestWorkspace } from '../../src/workspace.js';
import type { V8CpuProfile } from '../../src/types.js';
import type { HotFunction, CorrelatedProfile, TestFileTiming } from '@zeitzeuge/utils';

const FIXTURE_DIR = resolve(import.meta.dir, '..', 'fixtures', 'vitest-e2e');
const RUNNER_PATH = join(FIXTURE_DIR, 'runner.mjs');
const APP_SOURCE = join(FIXTURE_DIR, 'src', 'data-processing.mjs');
const APP_SOURCE_FILENAME = 'data-processing.mjs';

/**
 * The project root used for source classification.
 * Anything inside this directory is "application" code.
 */
const PROJECT_ROOT = FIXTURE_DIR;

/**
 * Expected function names that should appear as hot functions.
 * These match the exports from data-processing.mjs.
 */
const EXPECTED_HOT_FUNCTIONS = [
  'buildUserIndex',
  'computeCorrelationMatrix',
  'deduplicateRecords',
  'normalizePayload',
  // setupMetricsCollector's cost is spread across anonymous listener
  // callbacks and JSON builtins — checked separately
];

// ── Test state ──

let profileDir: string;
let profilePath: string;
let rawProfile: V8CpuProfile;

describe('e2e: Vitest integration pipeline', () => {
  // ── Setup: generate a real V8 CPU profile ──────────────────

  beforeAll(() => {
    profileDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-e2e-'));

    execSync(`node --cpu-prof --cpu-prof-dir="${profileDir}" "${RUNNER_PATH}"`, {
      cwd: FIXTURE_DIR,
      timeout: 30_000,
      stdio: 'pipe',
    });

    const files = readdirSync(profileDir).filter((f) => f.endsWith('.cpuprofile'));
    expect(files.length).toBeGreaterThanOrEqual(1);

    profilePath = join(profileDir, files[0]!);
    rawProfile = JSON.parse(readFileSync(profilePath, 'utf-8'));
  });

  afterAll(() => {
    if (profileDir && existsSync(profileDir)) {
      rmSync(profileDir, { recursive: true, force: true });
    }
  });

  // ── 1. Profile generation ─────────────────────────────────

  describe('profile generation', () => {
    test('generates a valid .cpuprofile with nodes and samples', () => {
      expect(rawProfile.nodes.length).toBeGreaterThan(0);
      expect(rawProfile.samples.length).toBeGreaterThan(50);
      expect(rawProfile.endTime).toBeGreaterThan(rawProfile.startTime);
    });

    test('profile contains nodes from the application source file', () => {
      const appNodes = rawProfile.nodes.filter((n) =>
        n.callFrame.url.includes(APP_SOURCE_FILENAME),
      );
      expect(appNodes.length).toBeGreaterThan(0);
    });
  });

  // ── 2. Profile parsing ────────────────────────────────────

  describe('profile parsing', () => {
    test('extracts all expected application functions as hot', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);

      expect(summary.sampleCount).toBe(rawProfile.samples.length);
      expect(summary.duration).toBeGreaterThan(0);
      expect(summary.hotFunctions.length).toBeGreaterThan(0);

      const hotFnNames = summary.hotFunctions.map((f) => f.functionName);
      for (const expected of EXPECTED_HOT_FUNCTIONS) {
        expect(hotFnNames).toContain(expected);
      }
    });

    test('computeCorrelationMatrix has significant self time (O(n²) CPU work)', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const fn = summary.hotFunctions.find((f) => f.functionName === 'computeCorrelationMatrix');

      expect(fn).toBeDefined();
      expect(fn!.selfTime).toBeGreaterThan(1);
      expect(fn!.selfPercent).toBeGreaterThan(0);
    });

    test('normalizePayload / JSON builtins show significant time (repeated serialization)', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);

      const jsonRelated = summary.hotFunctions.filter(
        (f) =>
          f.functionName === 'normalizePayload' ||
          f.functionName.includes('JSON') ||
          f.functionName === 'stringify' ||
          f.functionName === 'parse',
      );

      const totalSelfTime = jsonRelated.reduce((s, f) => s + f.selfTime, 0);
      expect(totalSelfTime).toBeGreaterThan(1);
    });

    test('buildUserIndex is detected (excessive allocation)', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const fn = summary.hotFunctions.find((f) => f.functionName === 'buildUserIndex');

      expect(fn).toBeDefined();
      expect(fn!.selfTime).toBeGreaterThan(0);
      expect(fn!.scriptUrl).toContain(APP_SOURCE_FILENAME);
    });

    test('deduplicateRecords is detected (O(n²) scan)', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const fn = summary.hotFunctions.find((f) => f.functionName === 'deduplicateRecords');

      expect(fn).toBeDefined();
      expect(fn!.selfTime).toBeGreaterThan(0);
    });

    test('script breakdown includes the application source file', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const appScript = summary.scriptBreakdown.find((s) =>
        s.scriptUrl.includes(APP_SOURCE_FILENAME),
      );

      expect(appScript).toBeDefined();
      expect(appScript!.selfTime).toBeGreaterThan(0);
      expect(appScript!.selfPercent).toBeGreaterThan(10);
    });
  });

  // ── 3. Source classification ──────────────────────────────

  describe('source classification', () => {
    test("application functions are classified as 'application'", () => {
      const summary = parseCpuProfile(rawProfile, profilePath);

      for (const fn of summary.hotFunctions) {
        if (fn.scriptUrl.includes(APP_SOURCE_FILENAME)) {
          const category = classifyScript(fn.scriptUrl, PROJECT_ROOT);
          expect(category).toBe('application');
        }
      }
    });

    test("node internals are classified as 'framework'", () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const nodeInternals = summary.hotFunctions.filter(
        (f) => f.scriptUrl.startsWith('node:') || f.scriptUrl.includes('node_modules'),
      );

      for (const fn of nodeInternals) {
        const category = classifyScript(fn.scriptUrl, PROJECT_ROOT);
        expect(['framework', 'dependency']).toContain(category);
      }
    });

    test("empty script URL is classified as 'unknown'", () => {
      expect(classifyScript('', PROJECT_ROOT)).toBe('unknown');
    });
  });

  // ── 4. Workspace building ─────────────────────────────────

  describe('workspace building', () => {
    test('workspace contains all expected categorized files', async () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, PROJECT_ROOT);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, PROJECT_ROOT);
      }

      const testTiming: TestFileTiming[] = [
        {
          file: 'data-processing.test.ts',
          duration: summary.duration,
          testCount: 5,
          passCount: 5,
          failCount: 0,
          setupTime: 0,
          tests: [
            { name: 'builds user index', duration: 100, status: 'pass' },
            { name: 'sets up metrics', duration: 80, status: 'pass' },
            { name: 'computes correlation', duration: 150, status: 'pass' },
            { name: 'deduplicates records', duration: 100, status: 'pass' },
            { name: 'normalizes payload', duration: 100, status: 'pass' },
          ],
        },
      ];

      const profiles: CorrelatedProfile[] = [
        { testFile: 'data-processing.test.ts', profilePath, summary },
      ];

      const testSources = new Map<string, string>();
      testSources.set('data-processing.test.ts', '// mock test source for workspace');

      const sourcePaths = new Map<string, string>();
      const appUrl = summary.hotFunctions.find((f) =>
        f.scriptUrl.includes(APP_SOURCE_FILENAME),
      )?.scriptUrl;
      if (appUrl) {
        sourcePaths.set(appUrl, readFileSync(APP_SOURCE, 'utf-8'));
      }

      const workspace = await createVitestWorkspace({
        testTiming,
        profiles,
        testSources,
        sourcePaths,
        projectRoot: PROJECT_ROOT,
      });

      try {
        const rootDir = (workspace.backend as any).cwd;

        expect(existsSync(join(rootDir, 'summary.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'timing', 'overview.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'profiles', 'index.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'hot-functions', 'global.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'hot-functions', 'application.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'hot-functions', 'dependencies.json'))).toBe(true);
        expect(existsSync(join(rootDir, 'scripts', 'application.json'))).toBe(true);
      } finally {
        workspace.cleanup();
      }
    });

    test('/hot-functions/application.json contains all application functions', async () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, PROJECT_ROOT);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, PROJECT_ROOT);
      }

      const profiles: CorrelatedProfile[] = [
        { testFile: 'data-processing.test.ts', profilePath, summary },
      ];

      const workspace = await createVitestWorkspace({
        testTiming: [
          {
            file: 'data-processing.test.ts',
            duration: summary.duration,
            testCount: 5,
            passCount: 5,
            failCount: 0,
            setupTime: 0,
            tests: [],
          },
        ],
        profiles,
        testSources: new Map(),
        projectRoot: PROJECT_ROOT,
      });

      try {
        const rootDir = (workspace.backend as any).cwd;
        const appHotFunctions: HotFunction[] = JSON.parse(
          readFileSync(join(rootDir, 'hot-functions', 'application.json'), 'utf-8'),
        );

        for (const fn of appHotFunctions) {
          expect(fn.sourceCategory).toBe('application');
        }

        const appFnNames = appHotFunctions.map((f) => f.functionName);
        expect(appFnNames).toContain('computeCorrelationMatrix');
        expect(appFnNames).toContain('normalizePayload');
        expect(appFnNames).toContain('buildUserIndex');
        expect(appFnNames).toContain('deduplicateRecords');

        for (const fn of appHotFunctions) {
          if (EXPECTED_HOT_FUNCTIONS.includes(fn.functionName)) {
            expect(fn.scriptUrl).toContain(APP_SOURCE_FILENAME);
          }
        }
      } finally {
        workspace.cleanup();
      }
    });

    test('/scripts/application.json shows application source as top script', async () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, PROJECT_ROOT);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, PROJECT_ROOT);
      }

      const profiles: CorrelatedProfile[] = [
        { testFile: 'data-processing.test.ts', profilePath, summary },
      ];

      const workspace = await createVitestWorkspace({
        testTiming: [
          {
            file: 'data-processing.test.ts',
            duration: summary.duration,
            testCount: 5,
            passCount: 5,
            failCount: 0,
            setupTime: 0,
            tests: [],
          },
        ],
        profiles,
        testSources: new Map(),
        projectRoot: PROJECT_ROOT,
      });

      try {
        const rootDir = (workspace.backend as any).cwd;
        const appScripts = JSON.parse(
          readFileSync(join(rootDir, 'scripts', 'application.json'), 'utf-8'),
        );

        expect(appScripts.length).toBeGreaterThan(0);
        expect(appScripts[0].scriptUrl).toContain(APP_SOURCE_FILENAME);
        expect(appScripts[0].selfTime).toBeGreaterThan(0);
      } finally {
        workspace.cleanup();
      }
    });
  });

  // ── 5. Detection quality ──────────────────────────────────

  describe('detection quality', () => {
    test('CPU-bound function is among the top 5 hottest', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const top5 = summary.hotFunctions.slice(0, 5).map((f) => f.functionName);

      expect(top5).toContain('computeCorrelationMatrix');
    });

    test('JSON-heavy function has > 1% self time', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);
      const fn = summary.hotFunctions.find((f) => f.functionName === 'normalizePayload');

      expect(fn).toBeDefined();
      expect(fn!.selfPercent).toBeGreaterThan(1);
    });

    test('expensive call trees have meaningful total time', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);

      expect(summary.expensiveCallTrees.length).toBeGreaterThan(0);

      const rootTree = summary.expensiveCallTrees[0]!;
      expect(rootTree.totalTime).toBeGreaterThan(0);
      expect(rootTree.totalPercent).toBeGreaterThan(50);
    });

    test('application functions account for > 30% of total CPU time', () => {
      const summary = parseCpuProfile(rawProfile, profilePath);

      const appFns = summary.hotFunctions.filter((f) => f.scriptUrl.includes(APP_SOURCE_FILENAME));

      const appSelfTime = appFns.reduce((s, f) => s + f.selfTime, 0);
      const appPercent = (appSelfTime / summary.duration) * 100;

      expect(appPercent).toBeGreaterThan(30);
    });
  });
});
