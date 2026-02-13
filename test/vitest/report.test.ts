import { test, expect, describe } from "bun:test";
import { generateTestMarkdown } from "../../src/output/report.js";
import type { Finding } from "../../src/types.js";
import type { TestFileTiming, CorrelatedProfile, CpuProfileSummary } from "../../src/vitest/types.js";

function makeTestTiming(overrides?: Partial<TestFileTiming>): TestFileTiming {
  return {
    file: "test/example.test.ts",
    duration: 500,
    testCount: 3,
    passCount: 2,
    failCount: 1,
    setupTime: 50,
    tests: [
      { name: "test one", duration: 200, status: "pass" },
      { name: "test two", duration: 250, status: "pass" },
      { name: "test three", duration: 50, status: "fail" },
    ],
    ...overrides,
  };
}

function makeProfileSummary(): CpuProfileSummary {
  return {
    profilePath: "/tmp/test.cpuprofile",
    duration: 500,
    sampleCount: 100,
    hotFunctions: [],
    expensiveCallTrees: [],
    gcSamples: 5,
    gcPercentage: 2.5,
    idlePercentage: 10,
    scriptBreakdown: [],
  };
}

function makeFinding(overrides?: Partial<Finding>): Finding {
  return {
    severity: "warning",
    title: "Test finding",
    description: "This is a test finding.",
    category: "hot-function",
    suggestedFix: "Fix the thing.",
    ...overrides,
  };
}

describe("generateTestMarkdown", () => {
  test("includes Vitest performance report header", () => {
    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [],
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("# Vitest Performance Report");
    expect(md).toContain("zeitzeuge v0.3.0");
  });

  test("includes test run statistics", () => {
    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [],
      testTiming: [
        makeTestTiming({ file: "test/a.test.ts", duration: 300, testCount: 5 }),
        makeTestTiming({ file: "test/b.test.ts", duration: 700, testCount: 3 }),
      ],
      profiles: [],
    });

    expect(md).toContain("8 tests across 2 files");
    expect(md).toContain("1.00s");
  });

  test("renders new test-performance categories correctly", () => {
    const findings: Finding[] = [
      makeFinding({ category: "slow-test", title: "Slow test detected" }),
      makeFinding({ category: "expensive-setup", title: "Heavy beforeAll" }),
      makeFinding({ category: "hot-function", title: "Hot function found" }),
      makeFinding({ category: "unnecessary-computation", title: "Unnecessary work" }),
      makeFinding({ category: "import-overhead", title: "Import overhead" }),
    ];

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings,
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("**Slow Test**");
    expect(md).toContain("**Expensive Setup**");
    expect(md).toContain("**Hot Function**");
    expect(md).toContain("**Unnecessary Computation**");
    expect(md).toContain("**Import Overhead**");
  });

  test("renders testFile metadata", () => {
    const finding = makeFinding({
      testFile: "test/slow.test.ts",
    });

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [finding],
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("`test/slow.test.ts`");
  });

  test("renders hotFunction metadata", () => {
    const finding = makeFinding({
      hotFunction: {
        name: "calculatePrimes",
        scriptUrl: "/src/math.ts",
        lineNumber: 42,
        selfTime: 350,
        selfPercent: 45.2,
      },
    });

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [finding],
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("`calculatePrimes`");
    expect(md).toContain("350ms");
    expect(md).toContain("45.2%");
  });

  test("produces no-issues message when findings is empty", () => {
    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [],
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("No issues found");
    expect(md).toContain("No significant performance problems");
  });

  test("counts findings by severity", () => {
    const findings: Finding[] = [
      makeFinding({ severity: "critical", title: "Critical issue" }),
      makeFinding({ severity: "warning", title: "Warning 1" }),
      makeFinding({ severity: "warning", title: "Warning 2" }),
      makeFinding({ severity: "info", title: "Info" }),
    ];

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings,
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("4 issues found");
    expect(md).toContain("1 critical");
    expect(md).toContain("2 warning");
    expect(md).toContain("1 info");
  });

  test("includes suggested fix as code block when it looks like code", () => {
    const finding = makeFinding({
      suggestedFix: 'import { mock } from "vitest";\nmock(() => {});',
    });

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [finding],
      testTiming: [makeTestTiming()],
      profiles: [],
    });

    expect(md).toContain("```ts");
    expect(md).toContain("import { mock }");
  });

  test("includes GC overhead in header", () => {
    const profile: CorrelatedProfile = {
      testFile: "test/example.test.ts",
      profilePath: "/tmp/test.cpuprofile",
      summary: { ...makeProfileSummary(), gcPercentage: 8.5, duration: 500 },
    };

    const md = generateTestMarkdown({
      version: "0.3.0",
      findings: [],
      testTiming: [makeTestTiming()],
      profiles: [profile],
    });

    expect(md).toContain("GC overhead");
  });
});
