/**
 * End-to-end test for the Deep Agent performance analysis.
 *
 * Generates a real V8 CPU profile from fixture code with known
 * bottlenecks, builds a workspace, and runs the full agent to
 * validate that findings are meaningful and reference the correct
 * source file / function names.
 *
 * Requires OPENAI_API_KEY or ANTHROPIC_API_KEY to be set.
 * Skips gracefully when no key is available.
 */

import { test, expect, describe } from 'bun:test';
import { execSync } from 'node:child_process';
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

import { parseCpuProfile } from '../../src/vitest/profile-parser.js';
import { classifyScript } from '../../src/vitest/classify.js';
import { createVitestWorkspace } from '../../src/vitest/workspace.js';
import { analyzeTestPerformance } from '../../src/analysis/agent.js';
import { initModel } from '../../src/models/init.js';
import type { Finding } from '../../src/types.js';
import type { CorrelatedProfile, TestFileTiming } from '../../src/vitest/types.js';
import ora from 'ora';

const HAS_API_KEY = !!(process.env.OPENAI_API_KEY || process.env.ANTHROPIC_API_KEY);

const FIXTURE_DIR = resolve(import.meta.dir, '..', 'fixtures', 'vitest-e2e');
const RUNNER_PATH = join(FIXTURE_DIR, 'runner.mjs');
const APP_SOURCE = join(FIXTURE_DIR, 'src', 'data-processing.mjs');
const APP_SOURCE_FILENAME = 'data-processing.mjs';
const PROJECT_ROOT = FIXTURE_DIR;

const KNOWN_FUNCTIONS = [
  'buildUserIndex',
  'setupMetricsCollector',
  'computeCorrelationMatrix',
  'deduplicateRecords',
  'normalizePayload',
];

/**
 * Build a workspace from a fresh CPU profile, run the agent, return findings.
 */
async function runAgentAnalysis(): Promise<Finding[]> {
  // 1. Generate CPU profile
  const profileDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-agent-e2e-'));
  try {
    execSync(`node --cpu-prof --cpu-prof-dir="${profileDir}" "${RUNNER_PATH}"`, {
      cwd: FIXTURE_DIR,
      timeout: 30_000,
      stdio: 'pipe',
    });

    const profileFile = readdirSync(profileDir).find((f) => f.endsWith('.cpuprofile'))!;
    const profilePath = join(profileDir, profileFile);
    const rawProfile = JSON.parse(readFileSync(profilePath, 'utf-8'));

    // 2. Parse & classify
    const summary = parseCpuProfile(rawProfile, profilePath);
    for (const fn of summary.hotFunctions)
      fn.sourceCategory = classifyScript(fn.scriptUrl, PROJECT_ROOT);
    for (const s of summary.scriptBreakdown)
      s.sourceCategory = classifyScript(s.scriptUrl, PROJECT_ROOT);

    // 3. Build workspace
    const profiles: CorrelatedProfile[] = [
      { testFile: 'data-processing.test.ts', profilePath, summary },
    ];
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
      testSources: new Map([['data-processing.test.ts', '// test source']]),
      sourcePaths,
      projectRoot: PROJECT_ROOT,
    });

    try {
      const model = initModel();
      const spinner = ora({ text: 'zeitzeuge: Analyzing...', isEnabled: false }).start();
      try {
        return await analyzeTestPerformance(model, workspace.backend, spinner);
      } finally {
        spinner.stop();
      }
    } finally {
      workspace.cleanup();
    }
  } finally {
    rmSync(profileDir, { recursive: true, force: true });
  }
}

describe.skipIf(!HAS_API_KEY)('e2e: agent analysis', () => {
  // Run the full pipeline once — all assertions share the same findings.
  // Using a single test avoids `beforeAll` timing quirks in bun test.
  test('agent produces meaningful, actionable findings for application code', async () => {
    const findings = await runAgentAnalysis();

    // ── Returns findings ──
    expect(findings.length).toBeGreaterThanOrEqual(3);

    // ── Every finding is well-formed ──
    for (const f of findings) {
      expect(f.severity).toMatch(/^(critical|warning|info)$/);
      expect(f.title.length).toBeGreaterThan(5);
      expect(f.description.length).toBeGreaterThan(20);
      expect(f.suggestedFix.length).toBeGreaterThan(10);
      expect(f.category).toBeDefined();
    }

    // ── References the application source file ──
    const referencesAppSource = findings.some((f) => {
      const text = [
        f.description,
        f.suggestedFix,
        f.resourceUrl ?? '',
        f.hotFunction?.scriptUrl ?? '',
      ].join(' ');
      return text.includes('data-processing');
    });
    expect(referencesAppSource).toBe(true);

    // ── Mentions known application functions ──
    const mentionedFunctions = new Set<string>();
    for (const f of findings) {
      const text = [f.title, f.description, f.suggestedFix].join(' ');
      for (const name of KNOWN_FUNCTIONS) {
        if (text.includes(name)) mentionedFunctions.add(name);
      }
    }
    expect(mentionedFunctions.size).toBeGreaterThanOrEqual(2);

    // ── At least one finding has a code-level suggested fix ──
    const hasCodeFix = findings.some((f) => {
      const fix = f.suggestedFix;
      return (
        fix.includes('(') ||
        fix.includes('=') ||
        fix.includes('const ') ||
        fix.includes('let ') ||
        fix.includes('import ') ||
        fix.includes('```')
      );
    });
    expect(hasCodeFix).toBe(true);
  }, 180_000); // 3 minute timeout for LLM round-trip
});
