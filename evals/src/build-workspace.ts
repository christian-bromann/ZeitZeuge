/**
 * Build a VFS workspace from the static dataset in evals/dataset/.
 *
 * Mirrors the workspace construction that the ZeitZeugeReporter does
 * during a live Vitest run, but reads from pre-captured CPU profiles
 * and listener-tracking data instead.
 */

import { readdirSync, readFileSync, statSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

import {
  parseCpuProfile,
  createVitestWorkspace,
  classifyScript,
  computeMetrics,
  aggregateListenerTracking,
  LISTENER_TRACKING_JSONL,
  type RawListenerTrackingData,
  type V8CpuProfile,
} from '@zeitzeuge/vitest';
import {
  getListenerImbalances,
  type EventListenerTracking,
  type TestFileTiming,
  type CorrelatedProfile,
  type PerformanceMetrics,
} from '@zeitzeuge/utils';
// eslint-disable-next-line @typescript-eslint/no-empty-interface -- BackendProtocol is opaque here
type BackendProtocol = Awaited<ReturnType<typeof createVitestWorkspace>>['backend'];

export interface WorkspaceResult {
  /** Backend for use with createDeepAgent. */
  backend: BackendProtocol;
  /** Clean up the temporary directory when done. */
  cleanup: () => void;
  /** Computed performance metrics for the current run. */
  metrics: PerformanceMetrics;
  /** Whether listener tracking data was found and included. */
  hasListenerTracking: boolean;
}

/**
 * Build a VFS workspace from the static eval dataset.
 *
 * @param datasetPath - Path to evals/dataset/ containing .cpuprofile files and listener-tracking.jsonl
 * @param exampleProjectRoot - Path to example/ containing source and test files
 */
export async function buildWorkspaceFromDataset(
  datasetPath: string,
  exampleProjectRoot: string,
): Promise<WorkspaceResult> {
  const absDataset = resolve(datasetPath);
  const absProject = resolve(exampleProjectRoot);

  // ── 1. Load and parse CPU profiles ──
  const profiles = loadAndParseProfiles(absDataset, absProject);
  if (profiles.length === 0) {
    throw new Error(`No .cpuprofile files found in ${absDataset}`);
  }

  // ── 2. Load and aggregate listener tracking ──
  const listenerTracking = loadListenerTracking(absDataset);

  // ── 3. Build synthetic test timing from profile data ──
  const testTiming = buildSyntheticTestTiming(profiles);

  // ── 4. Read source files ──
  const testSources = readSourceTree(join(absProject, 'tests'));
  const sourcePaths = readSourceTree(join(absProject, 'src'));

  // ── 5. Compute metrics ──
  const metrics = computeMetrics(
    testTiming,
    profiles,
    undefined, // no heap profiles
    absProject,
    listenerTracking ?? undefined,
  );

  // ── 6. Build workspace ──
  const workspace = await createVitestWorkspace({
    testTiming,
    profiles,
    testSources,
    sourcePaths,
    projectRoot: absProject,
    metrics,
    listenerTracking: listenerTracking ?? undefined,
  });

  return {
    backend: workspace.backend,
    cleanup: workspace.cleanup,
    metrics,
    hasListenerTracking: !!listenerTracking,
  };
}

// ── Profile loading ──────────────────────────────────────────

function loadAndParseProfiles(datasetPath: string, projectRoot: string): CorrelatedProfile[] {
  const allFiles = readdirSync(datasetPath);
  const cpuFiles = allFiles
    .filter((f) => f.endsWith('.cpuprofile'))
    .map((f) => {
      const fullPath = join(datasetPath, f);
      const stat = statSync(fullPath);
      return { name: f, path: fullPath, lastModified: stat.mtimeMs, size: stat.size };
    })
    .sort((a, b) => a.lastModified - b.lastModified);

  if (cpuFiles.length === 0) return [];

  // We don't have actual test file names from the dataset, so we use
  // the profile filenames. The agent mostly cares about the hot functions
  // and source code, not the test file correlation.
  const testFileSet = new Set<string>();
  // Gather test files from the project for classification
  const testsDir = join(projectRoot, 'tests');
  if (existsSync(testsDir)) {
    for (const f of readdirSync(testsDir)) {
      if (f.endsWith('.ts') || f.endsWith('.js')) {
        testFileSet.add(resolve(join(testsDir, f)));
      }
    }
  }

  const results: CorrelatedProfile[] = [];

  for (let i = 0; i < cpuFiles.length; i++) {
    const pf = cpuFiles[i]!;
    try {
      const content = readFileSync(pf.path, 'utf-8');
      const rawProfile: V8CpuProfile = JSON.parse(content);
      const summary = parseCpuProfile(rawProfile, pf.path);

      // Classify each hot function and script by source category
      for (const fn of summary.hotFunctions) {
        fn.sourceCategory = classifyScript(fn.scriptUrl, projectRoot, testFileSet);
      }
      for (const script of summary.scriptBreakdown) {
        script.sourceCategory = classifyScript(script.scriptUrl, projectRoot, testFileSet);
      }

      // Derive a synthetic test file name from the profile
      // PIDs in filenames help correlate, but we also fall back to index-based naming
      const testFile = deriveTestFile(pf.name, projectRoot, summary) ?? `unknown-${i}`;

      results.push({
        testFile,
        profilePath: pf.path,
        summary,
      });
    } catch (err) {
      console.warn(
        `[evals] Failed to parse profile ${pf.name}: ${err instanceof Error ? err.message : err}`,
      );
    }
  }

  // Keep only the largest profiles (by duration)
  results.sort((a, b) => b.summary.duration - a.summary.duration);
  return results.slice(0, 10);
}

/**
 * Try to derive which test file a profile belongs to by looking at
 * which application source files appear in its hot functions.
 */
function deriveTestFile(
  profileName: string,
  projectRoot: string,
  summary: CorrelatedProfile['summary'],
): string | null {
  // Look at application-category scripts to guess the test file
  const appScripts = summary.scriptBreakdown
    .filter((s) => s.sourceCategory === 'application' || s.sourceCategory === 'test')
    .sort((a, b) => b.selfTime - a.selfTime);

  for (const script of appScripts) {
    if (script.sourceCategory === 'test') {
      return script.scriptUrl;
    }
  }

  // If we found application scripts, use the hottest one's directory to guess
  if (appScripts.length > 0) {
    return appScripts[0]!.scriptUrl;
  }

  return null;
}

// ── Listener tracking ────────────────────────────────────────

function loadListenerTracking(datasetPath: string): EventListenerTracking | null {
  const jsonlPath = join(datasetPath, LISTENER_TRACKING_JSONL);
  if (!existsSync(jsonlPath)) {
    // Try the legacy filename
    const legacyPath = join(datasetPath, 'listener-tracking.jsonl');
    if (!existsSync(legacyPath)) return null;
  }

  const entries: RawListenerTrackingData[] = [];
  try {
    const content = readFileSync(jsonlPath, 'utf-8');
    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        entries.push(JSON.parse(trimmed) as RawListenerTrackingData);
      } catch {
        // skip malformed lines
      }
    }
  } catch {
    return null;
  }

  if (entries.length === 0) return null;

  const aggregated = aggregateListenerTracking(entries);

  // Only return if there's meaningful data
  const hasExceedances = aggregated.exceedances.length > 0;
  const hasImbalances = getListenerImbalances(aggregated).length > 0;

  if (!hasExceedances && !hasImbalances) return null;

  return aggregated;
}

// ── Synthetic test timing ────────────────────────────────────

function buildSyntheticTestTiming(profiles: CorrelatedProfile[]): TestFileTiming[] {
  return profiles.map((profile) => ({
    file: profile.testFile,
    duration: profile.summary.duration,
    testCount: 1,
    passCount: 1,
    failCount: 0,
    setupTime: 0,
    tests: [
      {
        name: `profile-${profile.testFile.split('/').pop() ?? 'unknown'}`,
        duration: profile.summary.duration,
        status: 'pass' as const,
      },
    ],
  }));
}

// ── Source file reading ──────────────────────────────────────

/**
 * Recursively read all .ts/.js files from a directory tree.
 * Returns a Map of absolute file paths to source content.
 */
function readSourceTree(dir: string): Map<string, string> {
  const sources = new Map<string, string>();

  if (!existsSync(dir)) return sources;

  function walk(currentDir: string): void {
    for (const entry of readdirSync(currentDir, { withFileTypes: true })) {
      const fullPath = join(currentDir, entry.name);
      if (entry.isDirectory()) {
        // Skip node_modules and hidden directories
        if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
        walk(fullPath);
      } else if (entry.isFile() && /\.(ts|js|tsx|jsx|mjs|cjs)$/.test(entry.name)) {
        try {
          sources.set(fullPath, readFileSync(fullPath, 'utf-8'));
        } catch {
          // skip files we can't read
        }
      }
    }
  }

  walk(dir);
  return sources;
}
