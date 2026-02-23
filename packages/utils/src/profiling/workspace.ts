/**
 * Build a VFS workspace for Deep Agent analysis of test performance.
 *
 * This is the shared implementation used by all test runner integrations.
 */

import { DATA_SCRIPTING_SKILL_FILES, PROFILE_ANALYSIS_SKILL_FILES } from '../skills/index.js';
import { createWorkspaceFromFiles } from '../workspace/builder.js';

import { mergeHotFunctions } from './merge-hot-functions.js';
import type { HotFunction, TestWorkspaceOptions, TestWorkspaceResult } from '../types.js';

const SOURCE_SNIPPET_CONTEXT = 5;
const SLOW_TEST_THRESHOLD = 100;

export async function createTestWorkspace(
  options: TestWorkspaceOptions,
): Promise<TestWorkspaceResult> {
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

  files['/timing/overview.json'] = JSON.stringify(testTiming, null, 2);

  const slowTests: Array<{ file: string; name: string; duration: number }> = [];
  for (const fileTiming of testTiming) {
    for (const test of fileTiming.tests) {
      if (test.duration > SLOW_TEST_THRESHOLD) {
        slowTests.push({ file: fileTiming.file, name: test.name, duration: test.duration });
      }
    }
  }
  slowTests.sort((a, b) => b.duration - a.duration);
  files['/timing/slow-tests.json'] = JSON.stringify(slowTests, null, 2);

  files['/profiles/index.json'] = JSON.stringify(
    profiles.map((p) => ({ testFile: p.testFile, profilePath: p.profilePath })),
    null,
    2,
  );

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

  if (heapProfiles && heapProfiles.length > 0) {
    files['/heap-profiles/index.json'] = JSON.stringify(
      heapProfiles.map((p) => ({ testFile: p.testFile, profilePath: p.profilePath })),
      null,
      2,
    );
    for (const hp of heapProfiles) {
      const safeName = sanitizeFilename(hp.testFile);
      files[`/heap-profiles/${safeName}.json`] = JSON.stringify(hp.summary, null, 2);
    }
  }

  const mergedHotFunctions = mergeHotFunctions(profiles);
  files['/hot-functions/global.json'] = JSON.stringify(mergedHotFunctions, null, 2);

  const appHotFunctions = mergedHotFunctions.filter((fn) => fn.sourceCategory === 'application');
  files['/hot-functions/application.json'] = JSON.stringify(appHotFunctions, null, 2);

  const depHotFunctions = mergedHotFunctions.filter((fn) => fn.sourceCategory === 'dependency');
  files['/hot-functions/dependencies.json'] = JSON.stringify(depHotFunctions, null, 2);

  const appScripts = profiles.flatMap((p) =>
    p.summary.scriptBreakdown.filter((s) => s.sourceCategory === 'application'),
  );
  const appScriptMap = new Map<string, { selfTime: number; functionCount: number }>();
  for (const s of appScripts) {
    const existing = appScriptMap.get(s.scriptUrl);
    if (existing) {
      existing.selfTime += s.selfTime;
      existing.functionCount = Math.max(existing.functionCount, s.functionCount);
    } else {
      appScriptMap.set(s.scriptUrl, { selfTime: s.selfTime, functionCount: s.functionCount });
    }
  }
  const totalDurationMs = testTiming.reduce((s, t) => s + t.duration, 0);
  const appScriptSummary = Array.from(appScriptMap.entries())
    .map(([scriptUrl, data]) => {
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
      depScriptMap.set(s.scriptUrl, { selfTime: s.selfTime, functionCount: s.functionCount });
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

  if (metrics) {
    files['/metrics/current.json'] = JSON.stringify(metrics, null, 2);
  }

  if (listenerTracking) {
    const sanitizedTracking = {
      ...listenerTracking,
      exceedances: listenerTracking.exceedances?.map((exc) => {
        if (!exc.stack || !options.projectRoot) return exc;
        return { ...exc, stack: exc.stack.replaceAll(options.projectRoot + '/', '') };
      }),
    };
    files['/listener-tracking.json'] = JSON.stringify(sanitizedTracking, null, 2);
  }

  for (const [filePath, source] of testSources) {
    let relPath = relativizePath(filePath, options.projectRoot);
    if (relPath.startsWith('tests/')) relPath = relPath.slice(6);
    files[`/tests/${relPath}`] = source;
  }

  const scriptUrlToWorkspacePath = new Map<string, string>();
  if (sourcePaths) {
    for (const [scriptUrl, source] of sourcePaths) {
      let relPath = relativizePath(scriptUrl, options.projectRoot);
      if (relPath.startsWith('src/')) relPath = relPath.slice(4);
      const wsPath = `/src/${relPath}`;
      files[wsPath] = source;
      scriptUrlToWorkspacePath.set(scriptUrl, wsPath);
      scriptUrlToWorkspacePath.set(`file://${scriptUrl}`, wsPath);
    }
  }

  if (sourcePaths && sourcePaths.size > 0) {
    const sanitizeCallerChain = (
      chain?: Array<{ functionName: string; scriptUrl: string; lineNumber: number }>,
    ) => {
      if (!chain || chain.length === 0) return undefined;
      return chain.map(({ scriptUrl, ...rest }) => {
        let relPath = relativizePath(scriptUrl, options.projectRoot);
        if (relPath.startsWith('src/')) relPath = relPath.slice(4);
        const wsPath =
          relPath.startsWith('node_modules/') || relPath.startsWith('node:')
            ? relPath
            : `/src/${relPath}`;
        return { ...rest, workspacePath: wsPath };
      });
    };

    const enrichHotFunction = (fn: HotFunction) => {
      const source =
        sourcePaths.get(fn.scriptUrl) ?? sourcePaths.get(normalizeFileUrl(fn.scriptUrl));
      const wsPath = scriptUrlToWorkspacePath.get(fn.scriptUrl);
      const { scriptUrl: _stripped, callerChain, ...fnWithoutScriptUrl } = fn;
      const sanitizedChain = sanitizeCallerChain(callerChain);
      const base = {
        ...fnWithoutScriptUrl,
        workspacePath: wsPath,
        ...(sanitizedChain ? { callerChain: sanitizedChain } : {}),
      };
      if (!source || fn.lineNumber < 0) return base;
      const sourceLines = source.split('\n');
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

  const sourceFilesList: string[] = [];
  const testFilesList: string[] = [];
  for (const key of Object.keys(files)) {
    if (key.startsWith('/src/') && !key.endsWith('/index.json') && !key.endsWith('.json')) {
      sourceFilesList.push(key);
    } else if (key.startsWith('/tests/')) {
      testFilesList.push(key);
    }
  }

  Object.assign(files, DATA_SCRIPTING_SKILL_FILES);
  Object.assign(files, PROFILE_ANALYSIS_SKILL_FILES);

  const { backend, cleanup } = await createWorkspaceFromFiles(files);
  return { backend, cleanup, sourceFiles: sourceFilesList, testFiles: testFilesList };
}

function normalizeFileUrl(url: string): string {
  if (url.startsWith('file://')) {
    try {
      return new URL(url).pathname;
    } catch {
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

function relativizePath(filePath: string, projectRoot?: string): string {
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
  const nmIdx = normalized.indexOf('node_modules/');
  if (nmIdx >= 0) {
    return normalized.slice(nmIdx);
  }
  return normalized.split('/').pop() || normalized;
}
