import { test, expect, describe } from 'bun:test';
import { computeMetrics } from '../src/metrics.js';
import type { TestFileTiming, CorrelatedProfile, CorrelatedHeapProfile } from '../src/types.js';

// ── Test data factories ──────────────────────────────────────

function createTestTiming(overrides: Partial<TestFileTiming> = {}): TestFileTiming {
  return {
    file: '/project/test/example.test.ts',
    duration: 500,
    testCount: 3,
    passCount: 2,
    failCount: 1,
    setupTime: 10,
    tests: [
      { name: 'test A', duration: 100, status: 'pass' },
      { name: 'test B', duration: 200, status: 'pass' },
      { name: 'test C', duration: 200, status: 'fail' },
    ],
    ...overrides,
  };
}

function createProfile(overrides: Partial<CorrelatedProfile> = {}): CorrelatedProfile {
  return {
    testFile: '/project/test/example.test.ts',
    profilePath: '/tmp/CPU.0001.cpuprofile',
    summary: {
      profilePath: '/tmp/CPU.0001.cpuprofile',
      duration: 500,
      sampleCount: 100,
      hotFunctions: [
        {
          functionName: 'processData',
          scriptUrl: '/project/src/utils.ts',
          lineNumber: 42,
          columnNumber: 0,
          selfTime: 150,
          totalTime: 200,
          hitCount: 30,
          selfPercent: 30,
          sourceCategory: 'application',
        },
        {
          functionName: 'JSON.parse',
          scriptUrl: '',
          lineNumber: 0,
          columnNumber: 0,
          selfTime: 50,
          totalTime: 50,
          hitCount: 10,
          selfPercent: 10,
          sourceCategory: 'dependency',
        },
      ],
      expensiveCallTrees: [],
      gcSamples: 5,
      gcPercentage: 5,
      idlePercentage: 10,
      scriptBreakdown: [
        {
          scriptUrl: '/project/src/utils.ts',
          selfTime: 150,
          selfPercent: 30,
          functionCount: 3,
          sourceCategory: 'application',
        },
        {
          scriptUrl: '/project/node_modules/lib/index.js',
          selfTime: 100,
          selfPercent: 20,
          functionCount: 5,
          sourceCategory: 'dependency',
        },
        {
          scriptUrl: '/project/test/example.test.ts',
          selfTime: 50,
          selfPercent: 10,
          functionCount: 2,
          sourceCategory: 'test',
        },
      ],
    },
    ...overrides,
  };
}

// ── computeMetrics ───────────────────────────────────────────

describe('computeMetrics', () => {
  test('computes suite-level metrics from test timing', () => {
    const timing = [
      createTestTiming(),
      createTestTiming({
        file: '/project/test/other.test.ts',
        duration: 300,
        testCount: 2,
        passCount: 2,
        failCount: 0,
        setupTime: 5,
        tests: [
          { name: 'test D', duration: 150, status: 'pass' },
          { name: 'test E', duration: 150, status: 'pass' },
        ],
      }),
    ];

    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(metrics.version).toBe(1);
    expect(metrics.suite.totalDuration).toBe(800);
    expect(metrics.suite.totalTests).toBe(5);
    expect(metrics.suite.passCount).toBe(4);
    expect(metrics.suite.failCount).toBe(1);
    expect(metrics.suite.totalSetupTime).toBe(15);
    expect(metrics.suite.averageTestDuration).toBe(160); // 800/5
  });

  test('computes percentile metrics correctly', () => {
    const timing = [
      createTestTiming({
        tests: [
          { name: 'fast', duration: 10, status: 'pass' },
          { name: 'medium', duration: 50, status: 'pass' },
          { name: 'slow', duration: 200, status: 'pass' },
          { name: 'very slow', duration: 1000, status: 'pass' },
        ],
      }),
    ];

    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(metrics.suite.medianTestDuration).toBe(50);
    expect(metrics.suite.p95TestDuration).toBe(1000);
    expect(metrics.suite.slowestTestDuration).toBe(1000);
    expect(metrics.suite.slowestTestName).toBe('very slow');
  });

  test('computes CPU metrics from profiles', () => {
    const timing = [createTestTiming()];
    const profiles = [createProfile()];

    const metrics = computeMetrics(timing, profiles, undefined, '/project');

    expect(metrics.cpu.gcPercentage).toBe(5);
    expect(metrics.cpu.gcTime).toBe(25); // 500 * 5%
    expect(metrics.cpu.idlePercentage).toBe(10);
    expect(metrics.cpu.applicationTime).toBe(150);
    expect(metrics.cpu.applicationPercent).toBe(30);
    expect(metrics.cpu.dependencyTime).toBe(100);
    expect(metrics.cpu.dependencyPercent).toBe(20);
    expect(metrics.cpu.testFrameworkTime).toBe(50);
    expect(metrics.cpu.testFrameworkPercent).toBe(10);
  });

  test('returns zero CPU metrics when no profiles', () => {
    const timing = [createTestTiming()];
    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(metrics.cpu.gcPercentage).toBe(0);
    expect(metrics.cpu.gcTime).toBe(0);
    expect(metrics.cpu.applicationTime).toBe(0);
  });

  test('generates per-file metrics', () => {
    const timing = [
      createTestTiming({ file: '/project/test/a.test.ts', duration: 300 }),
      createTestTiming({ file: '/project/test/b.test.ts', duration: 500 }),
    ];

    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(Object.keys(metrics.files)).toHaveLength(2);
    expect(metrics.files['test/a.test.ts']).toBeDefined();
    expect(metrics.files['test/a.test.ts']!.duration).toBe(300);
    expect(metrics.files['test/b.test.ts']!.duration).toBe(500);
  });

  test('generates per-test metrics with composite keys', () => {
    const timing = [createTestTiming({ file: '/project/test/example.test.ts' })];
    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(Object.keys(metrics.tests)).toHaveLength(3);
    expect(metrics.tests['test/example.test.ts::test A']).toBeDefined();
    expect(metrics.tests['test/example.test.ts::test A']!.duration).toBe(100);
    expect(metrics.tests['test/example.test.ts::test A']!.status).toBe('pass');
  });

  test('extracts hot functions from profiles', () => {
    const timing = [createTestTiming()];
    const profiles = [createProfile()];

    const metrics = computeMetrics(timing, profiles, undefined, '/project');

    expect(metrics.hotFunctions.length).toBe(2);
    expect(metrics.hotFunctions[0]!.functionName).toBe('processData');
    expect(metrics.hotFunctions[0]!.selfTime).toBe(150);
    expect(metrics.hotFunctions[0]!.sourceCategory).toBe('application');
  });

  test('includes heap metrics when heap profiles provided', () => {
    const timing = [createTestTiming()];
    const heapProfiles: CorrelatedHeapProfile[] = [
      {
        testFile: '/project/test/example.test.ts',
        profilePath: '/tmp/Heap.0001.heapprofile',
        summary: {
          profilePath: '/tmp/Heap.0001.heapprofile',
          totalAllocatedBytes: 1024 * 1024,
          sampleCount: 50,
          topAllocations: [],
          scriptBreakdown: [],
        },
      },
    ];

    const metrics = computeMetrics(timing, [], heapProfiles, '/project');

    expect(metrics.heap).toBeDefined();
    expect(metrics.heap!.totalAllocatedBytes).toBe(1024 * 1024);
  });

  test('omits heap metrics when no heap profiles', () => {
    const timing = [createTestTiming()];
    const metrics = computeMetrics(timing, [], undefined, '/project');
    expect(metrics.heap).toBeUndefined();
  });

  test('relativizes file paths using projectRoot', () => {
    const timing = [createTestTiming({ file: '/project/test/deep/nested.test.ts' })];
    const metrics = computeMetrics(timing, [], undefined, '/project');

    expect(metrics.files['test/deep/nested.test.ts']).toBeDefined();
    expect(metrics.suite.slowestFile).toBe('test/deep/nested.test.ts');
  });
});
