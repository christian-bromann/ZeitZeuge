/**
 * Build a VFS workspace for Deep Agent analysis of Vitest test performance.
 *
 * Uses FilesystemBackend with virtualMode so the agent's absolute paths
 * (e.g. /summary.json) map to files inside a temp directory.
 */

import { FilesystemBackend, type BackendProtocol } from 'deepagents';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import type { CorrelatedProfile, HotFunction, VitestWorkspaceOptions } from './types.js';

export interface VitestWorkspaceResult {
  /** Backend for use with createDeepAgent */
  backend: BackendProtocol;
  /** Clean up the temporary directory when done */
  cleanup: () => void;
}

/** Minimum selfPercent for a source file to be included in the workspace. */
const SOURCE_INCLUSION_THRESHOLD = 1; // 1% of any profile

/** Slow test threshold in ms. */
const SLOW_TEST_THRESHOLD = 100;

/**
 * Create a workspace populated with test timing, CPU profile summaries,
 * hot functions, and source files for Deep Agent analysis.
 */
export async function createVitestWorkspace(
  options: VitestWorkspaceOptions,
): Promise<VitestWorkspaceResult> {
  const { testTiming, profiles, heapProfiles, testSources, sourcePaths } = options;

  const files: Record<string, string> = {};

  // ── /summary.json ──
  const totalTests = testTiming.reduce((s, t) => s + t.testCount, 0);
  const totalDuration = testTiming.reduce((s, t) => s + t.duration, 0);
  const passCount = testTiming.reduce((s, t) => s + t.passCount, 0);
  const failCount = testTiming.reduce((s, t) => s + t.failCount, 0);
  const slowest =
    testTiming.length > 0 ? testTiming.reduce((a, b) => (a.duration > b.duration ? a : b)) : null;
  const totalGcTime = profiles.reduce(
    (s, p) => s + (p.summary.duration * p.summary.gcPercentage) / 100,
    0,
  );
  const gcPercentage = totalDuration > 0 ? round((totalGcTime / totalDuration) * 100) : 0;

  files['/summary.json'] = JSON.stringify(
    {
      totalTests,
      totalDuration: round(totalDuration),
      passCount,
      failCount,
      profileCount: profiles.length,
      slowestFile: slowest?.file ?? null,
      slowestFileDuration: slowest ? round(slowest.duration) : 0,
      totalGcTime: round(totalGcTime),
      gcPercentage,
    },
    null,
    2,
  );

  // ── /timing/overview.json ──
  files['/timing/overview.json'] = JSON.stringify(testTiming, null, 2);

  // ── /timing/slow-tests.json ──
  const slowTests: Array<{
    file: string;
    name: string;
    duration: number;
  }> = [];
  for (const fileTiming of testTiming) {
    for (const test of fileTiming.tests) {
      if (test.duration > SLOW_TEST_THRESHOLD) {
        slowTests.push({
          file: fileTiming.file,
          name: test.name,
          duration: test.duration,
        });
      }
    }
  }
  slowTests.sort((a, b) => b.duration - a.duration);
  files['/timing/slow-tests.json'] = JSON.stringify(slowTests, null, 2);

  // ── /profiles/index.json ──
  files['/profiles/index.json'] = JSON.stringify(
    profiles.map((p) => ({
      testFile: p.testFile,
      profilePath: p.profilePath,
    })),
    null,
    2,
  );

  // ── /profiles/<sanitized-filename>.json ──
  for (const profile of profiles) {
    const safeName = sanitizeFilename(profile.testFile);
    files[`/profiles/${safeName}.json`] = JSON.stringify(profile.summary, null, 2);
  }

  // ── /heap-profiles/index.json + /heap-profiles/<sanitized-filename>.json ──
  if (heapProfiles && heapProfiles.length > 0) {
    files['/heap-profiles/index.json'] = JSON.stringify(
      heapProfiles.map((p) => ({
        testFile: p.testFile,
        profilePath: p.profilePath,
      })),
      null,
      2,
    );

    for (const hp of heapProfiles) {
      const safeName = sanitizeFilename(hp.testFile);
      files[`/heap-profiles/${safeName}.json`] = JSON.stringify(hp.summary, null, 2);
    }
  }

  // ── /hot-functions/global.json ──
  const mergedHotFunctions = mergeHotFunctions(profiles);
  files['/hot-functions/global.json'] = JSON.stringify(mergedHotFunctions, null, 2);

  // ── /hot-functions/application.json — only application code hotspots ──
  const appHotFunctions = mergedHotFunctions.filter((fn) => fn.sourceCategory === 'application');
  files['/hot-functions/application.json'] = JSON.stringify(appHotFunctions, null, 2);

  // ── /hot-functions/dependencies.json — dependency code hotspots ──
  const depHotFunctions = mergedHotFunctions.filter((fn) => fn.sourceCategory === 'dependency');
  files['/hot-functions/dependencies.json'] = JSON.stringify(depHotFunctions, null, 2);

  // ── /scripts/application.json — per-script breakdown for application code ──
  const appScripts = profiles.flatMap((p) =>
    p.summary.scriptBreakdown.filter((s) => s.sourceCategory === 'application'),
  );
  // Deduplicate and sum self time across profiles
  const appScriptMap = new Map<string, { selfTime: number; functionCount: number }>();
  for (const s of appScripts) {
    const existing = appScriptMap.get(s.scriptUrl);
    if (existing) {
      existing.selfTime += s.selfTime;
      existing.functionCount = Math.max(existing.functionCount, s.functionCount);
    } else {
      appScriptMap.set(s.scriptUrl, {
        selfTime: s.selfTime,
        functionCount: s.functionCount,
      });
    }
  }
  const totalDurationMs = testTiming.reduce((s, t) => s + t.duration, 0);
  const appScriptSummary = Array.from(appScriptMap.entries())
    .map(([scriptUrl, data]) => ({
      scriptUrl,
      selfTime: round(data.selfTime),
      selfPercent: totalDurationMs > 0 ? round((data.selfTime / totalDurationMs) * 100) : 0,
      functionCount: data.functionCount,
    }))
    .sort((a, b) => b.selfTime - a.selfTime);
  files['/scripts/application.json'] = JSON.stringify(appScriptSummary, null, 2);

  // ── /scripts/dependencies.json — per-script breakdown for dependencies ──
  const depScripts = profiles.flatMap((p) =>
    p.summary.scriptBreakdown.filter((s) => s.sourceCategory === 'dependency'),
  );
  const depScriptMap = new Map<string, { selfTime: number; functionCount: number }>();
  for (const s of depScripts) {
    const existing = depScriptMap.get(s.scriptUrl);
    if (existing) {
      existing.selfTime += s.selfTime;
      existing.functionCount = Math.max(existing.functionCount, s.functionCount);
    } else {
      depScriptMap.set(s.scriptUrl, {
        selfTime: s.selfTime,
        functionCount: s.functionCount,
      });
    }
  }
  const depScriptSummary = Array.from(depScriptMap.entries())
    .map(([scriptUrl, data]) => ({
      scriptUrl,
      selfTime: round(data.selfTime),
      selfPercent: totalDurationMs > 0 ? round((data.selfTime / totalDurationMs) * 100) : 0,
      functionCount: data.functionCount,
    }))
    .sort((a, b) => b.selfTime - a.selfTime);
  files['/scripts/dependencies.json'] = JSON.stringify(depScriptSummary, null, 2);

  // ── /tests/*.ts — test source files ──
  for (const [filePath, source] of testSources) {
    const filename = filePath.split('/').pop() ?? filePath;
    files[`/tests/${filename}`] = source;
  }

  // ── /src/*.ts — application source files referenced by hot functions ──
  // Application code uses a lower threshold than dependencies
  if (sourcePaths) {
    const hotScriptUrls = new Set<string>();
    for (const profile of profiles) {
      for (const fn of profile.summary.hotFunctions) {
        if (!fn.scriptUrl) continue;
        const threshold =
          fn.sourceCategory === 'application'
            ? 0.1 // very low threshold for application code
            : SOURCE_INCLUSION_THRESHOLD;
        if (fn.selfPercent >= threshold) {
          hotScriptUrls.add(fn.scriptUrl);
        }
      }
    }

    for (const [scriptUrl, source] of sourcePaths) {
      if (!hotScriptUrls.has(scriptUrl)) continue;
      const filename = scriptUrl.split('/').pop() ?? scriptUrl;
      files[`/src/${filename}`] = source;
    }
  }

  // ── Write all files to a temp directory ──
  const tempDir = mkdtempSync(join(tmpdir(), 'zeitzeuge-vitest-workspace-'));

  for (const [filePath, content] of Object.entries(files)) {
    const relPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = join(tempDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  const backend = new FilesystemBackend({
    rootDir: tempDir,
    virtualMode: true,
  });

  const cleanup = () => {
    try {
      const { rmSync } = require('node:fs');
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { backend, cleanup };
}

/**
 * Merge hot functions from multiple profiles, deduplicating by
 * (scriptUrl, functionName, lineNumber) and summing selfTime.
 */
export function mergeHotFunctions(profiles: CorrelatedProfile[]): HotFunction[] {
  const merged = new Map<string, HotFunction>();
  let totalDuration = 0;

  for (const profile of profiles) {
    totalDuration += profile.summary.duration;

    for (const fn of profile.summary.hotFunctions) {
      const key = `${fn.scriptUrl}:${fn.functionName}:${fn.lineNumber}`;
      const existing = merged.get(key);
      if (existing) {
        existing.selfTime += fn.selfTime;
        existing.totalTime += fn.totalTime;
        existing.hitCount += fn.hitCount;
      } else {
        merged.set(key, { ...fn });
      }
    }
  }

  // Recalculate selfPercent against total duration
  if (totalDuration > 0) {
    for (const fn of merged.values()) {
      fn.selfPercent = round((fn.selfTime / totalDuration) * 100);
    }
  }

  const results = Array.from(merged.values());
  results.sort((a, b) => b.selfTime - a.selfTime);

  return results.slice(0, 50);
}

// ── Helpers ───────────────────────────────────────────────────

function sanitizeFilename(filePath: string): string {
  return filePath
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
