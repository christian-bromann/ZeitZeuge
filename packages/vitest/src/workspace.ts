/**
 * Build a VFS workspace for Deep Agent analysis of Vitest test performance.
 *
 * Uses VfsSandbox from @langchain/node-vfs so the agent's absolute paths
 * (e.g. /summary.json) map to files inside an in-memory virtual filesystem.
 */

import type { BackendProtocol } from 'deepagents';
import {
  createWorkspaceFromFiles,
  DATA_SCRIPTING_SKILL_FILES,
  PROFILE_ANALYSIS_SKILL_FILES,
  mergeHotFunctions,
} from '@zeitzeuge/utils';

import type { HotFunction, VitestWorkspaceOptions } from './types.js';

/** Number of context lines to include above and below a hot function's line. */
const SOURCE_SNIPPET_CONTEXT = 5;

export interface VitestWorkspaceResult {
  /** Backend for use with createDeepAgent */
  backend: BackendProtocol;
  /** Clean up sandbox resources when done */
  cleanup: () => Promise<void>;
  /** Workspace-relative paths for application source files (e.g. "src/utils/crypto.ts") */
  sourceFiles: string[];
  /** Workspace-relative paths for test files (e.g. "tests/tests/crypto.test.ts") */
  testFiles: string[];
}

/** Slow test threshold in ms. */
const SLOW_TEST_THRESHOLD = 100;

/**
 * Create a workspace populated with test timing, CPU profile summaries,
 * hot functions, and source files for Deep Agent analysis.
 */
export async function createVitestWorkspace(
  options: VitestWorkspaceOptions,
): Promise<VitestWorkspaceResult> {
  const {
    testTiming,
    profiles,
    heapProfiles,
    testSources,
    sourcePaths,
    metrics,
    listenerTracking,
  } = options;

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
  // Sanitize absolute scriptUrl paths → workspace-relative paths so the agent
  // doesn't try to read OS-level absolute paths in the VFS.
  for (const profile of profiles) {
    const safeName = sanitizeFilename(profile.testFile);
    const sanitized = {
      ...profile.summary,
      hotFunctions: profile.summary.hotFunctions.map((fn) => {
        const { scriptUrl: _s, ...rest } = fn;
        let relPath = relativizePath(fn.scriptUrl, options.projectRoot);
        if (relPath.startsWith('src/')) relPath = relPath.slice(4);
        return { ...rest, workspacePath: `/src/${relPath}` };
      }),
      scriptBreakdown: profile.summary.scriptBreakdown.map((s) => {
        const { scriptUrl: _s, ...rest } = s;
        let relPath = relativizePath(s.scriptUrl, options.projectRoot);
        if (relPath.startsWith('src/')) relPath = relPath.slice(4);
        return { ...rest, workspacePath: `/src/${relPath}` };
      }),
    };
    files[`/profiles/${safeName}.json`] = JSON.stringify(sanitized, null, 2);
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
    .map(([scriptUrl, data]) => {
      // Use workspace-relative path instead of absolute scriptUrl
      let relPath = relativizePath(scriptUrl, options.projectRoot);
      if (relPath.startsWith('src/')) relPath = relPath.slice(4);
      return {
        workspacePath: `/src/${relPath}`,
        selfTime: round(data.selfTime),
        selfPercent: totalDurationMs > 0 ? round((data.selfTime / totalDurationMs) * 100) : 0,
        functionCount: data.functionCount,
      };
    })
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
    .map(([scriptUrl, data]) => {
      const relPath = relativizePath(scriptUrl, options.projectRoot);
      return {
        workspacePath: relPath.startsWith('node_modules/') ? relPath : scriptUrl,
        selfTime: round(data.selfTime),
        selfPercent: totalDurationMs > 0 ? round((data.selfTime / totalDurationMs) * 100) : 0,
        functionCount: data.functionCount,
      };
    })
    .sort((a, b) => b.selfTime - a.selfTime);
  files['/scripts/dependencies.json'] = JSON.stringify(depScriptSummary, null, 2);

  // ── /metrics/current.json — computed performance metrics ──
  if (metrics) {
    files['/metrics/current.json'] = JSON.stringify(metrics, null, 2);
  }

  // ── /listener-tracking.json — EventTarget/EventEmitter listener patterns ──
  if (listenerTracking) {
    // Sanitize absolute paths in exceedance stack traces so the agent
    // doesn't see OS-level paths that don't exist in the VFS.
    const sanitizedTracking = {
      ...listenerTracking,
      exceedances: listenerTracking.exceedances?.map((exc) => {
        if (!exc.stack || !options.projectRoot) return exc;
        return {
          ...exc,
          stack: exc.stack.replaceAll(options.projectRoot + '/', ''),
        };
      }),
    };
    files['/listener-tracking.json'] = JSON.stringify(sanitizedTracking, null, 2);
  }

  // ── /tests/*.ts — test source files ──
  // Preserve directory structure relative to project root
  for (const [filePath, source] of testSources) {
    let relPath = relativizePath(filePath, options.projectRoot);
    // Strip leading "tests/" to avoid double prefix /tests/tests/
    if (relPath.startsWith('tests/')) relPath = relPath.slice(6);
    files[`/tests/${relPath}`] = source;
  }

  // ── /src/*.ts — application source files ──
  // Include ALL application source files since application code is typically a
  // tiny fraction of total CPU time and the agent needs the source to provide
  // meaningful beforeCode/afterCode suggestions.
  const scriptUrlToWorkspacePath = new Map<string, string>();
  if (sourcePaths) {
    // Write ALL source files to the VFS — the agent needs to read every file
    // to discover issues that may not appear as hot functions (e.g., quadratic
    // algorithms, regex recompilation, closure leaks).
    for (const [scriptUrl, source] of sourcePaths) {
      let relPath = relativizePath(scriptUrl, options.projectRoot);
      // Strip leading "src/" to avoid double prefix /src/src/
      if (relPath.startsWith('src/')) relPath = relPath.slice(4);
      const wsPath = `/src/${relPath}`;
      files[wsPath] = source;
      // Map both the plain path and any file:// variant so enrichHotFunction
      // can look up workspace paths from V8 profile scriptUrls (which use
      // file:// URIs) as well as plain OS paths from readSourceTree.
      scriptUrlToWorkspacePath.set(scriptUrl, wsPath);
      scriptUrlToWorkspacePath.set(`file://${scriptUrl}`, wsPath);
    }
  }

  // ── Embed source snippets into hot function data ──
  // Re-generate hot function files with sourceSnippet and workspacePath fields.
  // IMPORTANT: Strip `scriptUrl` (absolute OS path) from the output so the
  // agent only sees `workspacePath` (VFS-relative) and doesn't try to read
  // absolute paths that don't exist in the workspace.
  if (sourcePaths && sourcePaths.size > 0) {
    /** Relativize a callerChain entry, stripping the absolute scriptUrl. */
    const sanitizeCallerChain = (
      chain?: Array<{ functionName: string; scriptUrl: string; lineNumber: number }>,
    ) => {
      if (!chain || chain.length === 0) return undefined;
      return chain.map(({ scriptUrl, ...rest }) => {
        let relPath = relativizePath(scriptUrl, options.projectRoot);
        if (relPath.startsWith('src/')) relPath = relPath.slice(4);
        // Only prefix with /src/ for application paths (not node_modules or node:)
        const wsPath =
          relPath.startsWith('node_modules/') || relPath.startsWith('node:')
            ? relPath
            : `/src/${relPath}`;
        return { ...rest, workspacePath: wsPath };
      });
    };

    const enrichHotFunction = (fn: HotFunction) => {
      // V8 profiles use file:// URIs; sourcePaths keys are plain absolute paths.
      // Try both formats to find the source content.
      const source =
        sourcePaths.get(fn.scriptUrl) ?? sourcePaths.get(normalizeFileUrl(fn.scriptUrl));
      const wsPath = scriptUrlToWorkspacePath.get(fn.scriptUrl);

      // Strip scriptUrl — agent should use workspacePath instead
      const { scriptUrl: _stripped, callerChain, ...fnWithoutScriptUrl } = fn;

      // Sanitize callerChain to replace absolute scriptUrl with workspace paths
      const sanitizedChain = sanitizeCallerChain(callerChain);
      const base = {
        ...fnWithoutScriptUrl,
        workspacePath: wsPath,
        ...(sanitizedChain ? { callerChain: sanitizedChain } : {}),
      };

      if (!source || fn.lineNumber < 0) return base;

      const sourceLines = source.split('\n');
      // V8 line numbers are 0-based; convert to 1-based for display
      const targetLine = fn.lineNumber;
      const start = Math.max(0, targetLine - SOURCE_SNIPPET_CONTEXT);
      const end = Math.min(sourceLines.length, targetLine + SOURCE_SNIPPET_CONTEXT + 1);
      const snippet = sourceLines
        .slice(start, end)
        .map((line, i) => {
          const lineNum = start + i + 1;
          const marker = lineNum === targetLine + 1 ? '>' : ' ';
          return `${marker} ${String(lineNum).padStart(4)} | ${line}`;
        })
        .join('\n');

      return { ...base, sourceSnippet: snippet };
    };

    // Re-write hot function files with embedded snippets
    const enrichedAll = mergedHotFunctions.map(enrichHotFunction);
    files['/hot-functions/global.json'] = JSON.stringify(enrichedAll, null, 2);
    files['/hot-functions/application.json'] = JSON.stringify(
      enrichedAll.filter((fn) => fn.sourceCategory === 'application'),
      null,
      2,
    );
    files['/hot-functions/dependencies.json'] = JSON.stringify(
      enrichedAll.filter((fn) => fn.sourceCategory === 'dependency'),
      null,
      2,
    );
  }

  // ── /src/index.json — file-to-hotfunctions mapping ──
  const fileIndex: Record<
    string,
    Array<{ functionName: string; lineNumber: number; selfTime: number; selfPercent: number }>
  > = {};
  for (const fn of mergedHotFunctions) {
    const wsPath = scriptUrlToWorkspacePath.get(fn.scriptUrl);
    if (!wsPath) continue;
    if (!fileIndex[wsPath]) fileIndex[wsPath] = [];
    fileIndex[wsPath]?.push({
      functionName: fn.functionName,
      lineNumber: fn.lineNumber,
      selfTime: fn.selfTime,
      selfPercent: fn.selfPercent,
    });
  }
  if (Object.keys(fileIndex).length > 0) {
    files['/src/index.json'] = JSON.stringify(fileIndex, null, 2);
  }

  // ── Collect workspace-relative file paths for user message enumeration ──
  const sourceFilesList: string[] = [];
  const testFilesList: string[] = [];

  for (const key of Object.keys(files)) {
    if (key.startsWith('/src/') && !key.endsWith('/index.json') && !key.endsWith('.json')) {
      sourceFilesList.push(key);
    } else if (key.startsWith('/tests/')) {
      testFilesList.push(key);
    }
  }

  // ── Skill files ──
  Object.assign(files, DATA_SCRIPTING_SKILL_FILES);
  Object.assign(files, PROFILE_ANALYSIS_SKILL_FILES);

  // ── Write all files to a temp directory ──
  const { backend, cleanup } = await createWorkspaceFromFiles(files);
  return { backend, cleanup, sourceFiles: sourceFilesList, testFiles: testFilesList };
}

// Re-export for backward compatibility
export { mergeHotFunctions } from '@zeitzeuge/utils';

// ── Helpers ───────────────────────────────────────────────────

/**
 * Strip the file:// protocol prefix from a URL, returning a plain OS path.
 * V8 CPU profiles use file:// URIs while readSourceTree returns plain paths.
 */
function normalizeFileUrl(url: string): string {
  if (url.startsWith('file://')) {
    try {
      return new URL(url).pathname;
    } catch {
      // fallback: strip "file://" manually
      return url.slice(7);
    }
  }
  return url;
}

function sanitizeFilename(filePath: string): string {
  return filePath
    .replace(/[/\\]/g, '_')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .replace(/^_+/, '');
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Relativize a file path against the project root, preserving directory
 * structure. Falls back to the filename if no project root is provided
 * or the path is not under the project root.
 */
function relativizePath(filePath: string, projectRoot?: string): string {
  // Strip file:// prefix if present
  let normalized = filePath;
  if (normalized.startsWith('file://')) {
    try {
      normalized = new URL(normalized).pathname;
    } catch {
      // keep as-is
    }
  }

  if (projectRoot && normalized.startsWith(projectRoot)) {
    let rel = normalized.slice(projectRoot.length);
    if (rel.startsWith('/')) rel = rel.slice(1);
    return rel || normalized.split('/').pop() || normalized;
  }

  // For node_modules paths, keep from node_modules/ onward
  const nmIdx = normalized.indexOf('node_modules/');
  if (nmIdx >= 0) {
    return normalized.slice(nmIdx);
  }

  return normalized.split('/').pop() || normalized;
}
