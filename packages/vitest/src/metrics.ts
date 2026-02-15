/**
 * Performance metrics computation for Vitest test runs.
 *
 * Computes a structured set of metrics from test timing and CPU/heap profile
 * data so users can see where time is spent at a glance.
 *
 * Metric type definitions live in @zeitzeuge/utils and are re-exported here
 * for backward compatibility.
 */

import type {
  TestFileTiming,
  CorrelatedProfile,
  EventListenerTracking,
  SuiteMetrics,
  CpuMetrics,
  FileMetric,
  TestMetric,
  HotFunctionMetric,
  PerformanceMetrics,
} from '@zeitzeuge/utils';
import type { CorrelatedHeapProfile } from './types.js';
import { mergeHotFunctions } from './workspace.js';

// Re-export metric types for backward compatibility
export type {
  SuiteMetrics,
  CpuMetrics,
  FileMetric,
  TestMetric,
  HotFunctionMetric,
  PerformanceMetrics,
} from '@zeitzeuge/utils';

// ── Metric computation ───────────────────────────────────────

/**
 * Compute performance metrics from a test run's collected data.
 */
export function computeMetrics(
  testTiming: TestFileTiming[],
  profiles: CorrelatedProfile[],
  heapProfiles?: CorrelatedHeapProfile[],
  projectRoot?: string,
  listenerTracking?: EventListenerTracking,
): PerformanceMetrics {
  // ── Suite metrics ──
  const allTestDurations = testTiming
    .flatMap((t) => t.tests.map((tc) => tc.duration))
    .sort((a, b) => a - b);

  const totalDuration = testTiming.reduce((s, t) => s + t.duration, 0);
  const totalTests = testTiming.reduce((s, t) => s + t.testCount, 0);
  const passCount = testTiming.reduce((s, t) => s + t.passCount, 0);
  const failCount = testTiming.reduce((s, t) => s + t.failCount, 0);
  const totalSetupTime = testTiming.reduce((s, t) => s + t.setupTime, 0);

  const averageTestDuration = totalTests > 0 ? totalDuration / totalTests : 0;
  const medianTestDuration = percentile(allTestDurations, 50);
  const p95TestDuration = percentile(allTestDurations, 95);

  const slowestTest =
    allTestDurations.length > 0
      ? testTiming
          .flatMap((t) => t.tests.map((tc) => ({ ...tc, file: t.file })))
          .reduce((a, b) => (a.duration > b.duration ? a : b))
      : null;

  const slowestFile =
    testTiming.length > 0 ? testTiming.reduce((a, b) => (a.duration > b.duration ? a : b)) : null;

  const suite: SuiteMetrics = {
    totalDuration: round(totalDuration),
    totalTests,
    passCount,
    failCount,
    totalSetupTime: round(totalSetupTime),
    averageTestDuration: round(averageTestDuration),
    medianTestDuration: round(medianTestDuration),
    p95TestDuration: round(p95TestDuration),
    slowestTestDuration: round(slowestTest?.duration ?? 0),
    slowestTestName: slowestTest?.name ?? '',
    slowestFileDuration: round(slowestFile?.duration ?? 0),
    slowestFile: relativize(slowestFile?.file ?? '', projectRoot),
  };

  // ── CPU metrics ──
  const cpu = computeCpuMetrics(profiles);

  // ── Per-file metrics ──
  const files: Record<string, FileMetric> = {};
  for (const timing of testTiming) {
    const relPath = relativize(timing.file, projectRoot);
    const profile = profiles.find((p) => p.testFile === timing.file);
    files[relPath] = {
      duration: round(timing.duration),
      testCount: timing.testCount,
      setupTime: round(timing.setupTime),
      gcPercentage: round(profile?.summary.gcPercentage ?? 0),
    };
  }

  // ── Per-test metrics ──
  const tests: Record<string, TestMetric> = {};
  for (const timing of testTiming) {
    const relPath = relativize(timing.file, projectRoot);
    for (const test of timing.tests) {
      const key = `${relPath}::${test.name}`;
      tests[key] = {
        duration: round(test.duration),
        status: test.status,
      };
    }
  }

  // ── Hot functions ──
  const merged = mergeHotFunctions(profiles);
  const hotFunctions: HotFunctionMetric[] = merged.slice(0, 20).map((fn) => ({
    key: `${fn.scriptUrl}:${fn.functionName}:${fn.lineNumber}`,
    functionName: fn.functionName,
    scriptUrl: relativize(fn.scriptUrl, projectRoot),
    lineNumber: fn.lineNumber,
    selfTime: round(fn.selfTime),
    selfPercent: round(fn.selfPercent),
    sourceCategory: fn.sourceCategory ?? 'unknown',
  }));

  // ── Heap metrics ──
  const heap =
    heapProfiles && heapProfiles.length > 0
      ? {
          totalAllocatedBytes: heapProfiles.reduce(
            (s, hp) => s + hp.summary.totalAllocatedBytes,
            0,
          ),
        }
      : undefined;

  return {
    version: 1,
    timestamp: new Date().toISOString(),
    suite,
    cpu,
    files,
    tests,
    hotFunctions,
    heap,
    listenerTracking,
  };
}

/**
 * Compute CPU profile-derived metrics.
 */
function computeCpuMetrics(profiles: CorrelatedProfile[]): CpuMetrics {
  if (profiles.length === 0) {
    return {
      gcPercentage: 0,
      gcTime: 0,
      idlePercentage: 0,
      idleTime: 0,
      applicationTime: 0,
      applicationPercent: 0,
      dependencyTime: 0,
      dependencyPercent: 0,
      testFrameworkTime: 0,
      testFrameworkPercent: 0,
    };
  }

  const totalProfileDuration = profiles.reduce((s, p) => s + p.summary.duration, 0);

  // GC metrics
  const totalGcTime = profiles.reduce(
    (s, p) => s + (p.summary.duration * p.summary.gcPercentage) / 100,
    0,
  );
  const gcPercentage = totalProfileDuration > 0 ? (totalGcTime / totalProfileDuration) * 100 : 0;

  // Idle metrics
  const totalIdleTime = profiles.reduce(
    (s, p) => s + (p.summary.duration * p.summary.idlePercentage) / 100,
    0,
  );
  const idlePercentage =
    totalProfileDuration > 0 ? (totalIdleTime / totalProfileDuration) * 100 : 0;

  // Category breakdown from script summaries
  let applicationTime = 0;
  let dependencyTime = 0;
  let testFrameworkTime = 0;

  for (const profile of profiles) {
    for (const script of profile.summary.scriptBreakdown) {
      switch (script.sourceCategory) {
        case 'application':
          applicationTime += script.selfTime;
          break;
        case 'dependency':
          dependencyTime += script.selfTime;
          break;
        case 'test':
        case 'framework':
          testFrameworkTime += script.selfTime;
          break;
      }
    }
  }

  const applicationPercent =
    totalProfileDuration > 0 ? (applicationTime / totalProfileDuration) * 100 : 0;
  const dependencyPercent =
    totalProfileDuration > 0 ? (dependencyTime / totalProfileDuration) * 100 : 0;
  const testFrameworkPercent =
    totalProfileDuration > 0 ? (testFrameworkTime / totalProfileDuration) * 100 : 0;

  return {
    gcPercentage: round(gcPercentage),
    gcTime: round(totalGcTime),
    idlePercentage: round(idlePercentage),
    idleTime: round(totalIdleTime),
    applicationTime: round(applicationTime),
    applicationPercent: round(applicationPercent),
    dependencyTime: round(dependencyTime),
    dependencyPercent: round(dependencyPercent),
    testFrameworkTime: round(testFrameworkTime),
    testFrameworkPercent: round(testFrameworkPercent),
  };
}

// ── Helpers ──────────────────────────────────────────────────

function percentile(sortedValues: number[], p: number): number {
  if (sortedValues.length === 0) return 0;
  const idx = Math.ceil((p / 100) * sortedValues.length) - 1;
  return sortedValues[Math.max(0, idx)]!;
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function relativize(filePath: string, projectRoot?: string): string {
  if (!projectRoot || !filePath) return filePath;
  if (filePath.startsWith(projectRoot)) {
    const rel = filePath.slice(projectRoot.length);
    return rel.startsWith('/') ? rel.slice(1) : rel;
  }
  return filePath;
}
