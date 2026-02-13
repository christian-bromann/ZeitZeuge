import { test, expect, describe } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { createVitestWorkspace, mergeHotFunctions } from "../../src/vitest/workspace.js";
import type {
  TestFileTiming,
  CorrelatedProfile,
  CpuProfileSummary,
  HotFunction,
} from "../../src/vitest/types.js";

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

function makeHotFunction(overrides?: Partial<HotFunction>): HotFunction {
  return {
    functionName: "hotFn",
    scriptUrl: "/project/src/utils.ts",
    lineNumber: 10,
    columnNumber: 0,
    selfTime: 100,
    totalTime: 150,
    hitCount: 50,
    selfPercent: 20,
    ...overrides,
  };
}

function makeProfileSummary(
  overrides?: Partial<CpuProfileSummary>
): CpuProfileSummary {
  return {
    profilePath: "/tmp/test.cpuprofile",
    duration: 500,
    sampleCount: 100,
    hotFunctions: [makeHotFunction()],
    expensiveCallTrees: [],
    gcSamples: 5,
    gcPercentage: 2.5,
    idlePercentage: 10,
    scriptBreakdown: [
      {
        scriptUrl: "/project/src/utils.ts",
        selfTime: 100,
        selfPercent: 20,
        functionCount: 1,
      },
    ],
    ...overrides,
  };
}

function makeCorrelatedProfile(
  overrides?: Partial<CorrelatedProfile>
): CorrelatedProfile {
  return {
    testFile: "test/example.test.ts",
    profilePath: "/tmp/test.cpuprofile",
    summary: makeProfileSummary(),
    ...overrides,
  };
}

/**
 * Helper: read a file from the workspace backend's cwd (temp dir).
 * FilesystemBackend stores the root as `cwd`.
 */
function readWorkspaceFile(backend: any, filePath: string): string {
  const rootDir = backend.cwd;
  if (!rootDir) {
    throw new Error("Could not determine backend cwd");
  }
  const relPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
  return readFileSync(join(rootDir, relPath), "utf-8");
}

function listWorkspaceDir(backend: any, dirPath: string): string[] {
  const rootDir = backend.cwd;
  if (!rootDir) {
    throw new Error("Could not determine backend cwd");
  }
  const relPath = dirPath.startsWith("/") ? dirPath.slice(1) : dirPath;
  try {
    return readdirSync(join(rootDir, relPath));
  } catch {
    return [];
  }
}

describe("createVitestWorkspace", () => {
  test("creates summary.json with correct aggregated metrics", async () => {
    const timing1 = makeTestTiming({ file: "test/a.test.ts", duration: 300, passCount: 3, failCount: 0, testCount: 3 });
    const timing2 = makeTestTiming({ file: "test/b.test.ts", duration: 700, passCount: 2, failCount: 1, testCount: 3 });

    const profile = makeCorrelatedProfile({ testFile: "test/b.test.ts" });
    const testSources = new Map([["test/a.test.ts", "// a"], ["test/b.test.ts", "// b"]]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing1, timing2],
      profiles: [profile],
      testSources,
    });

    try {
      const summary = JSON.parse(readWorkspaceFile(backend, "/summary.json"));

      expect(summary.totalTests).toBe(6);
      expect(summary.totalDuration).toBe(1000);
      expect(summary.passCount).toBe(5);
      expect(summary.failCount).toBe(1);
      expect(summary.profileCount).toBe(1);
      expect(summary.slowestFile).toBe("test/b.test.ts");
      expect(summary.slowestFileDuration).toBe(700);
    } finally {
      cleanup();
    }
  });

  test("creates timing/overview.json with per-file timing", async () => {
    const timing = makeTestTiming();
    const profile = makeCorrelatedProfile();
    const testSources = new Map([["test/example.test.ts", "// test"]]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
    });

    try {
      const overview = JSON.parse(
        readWorkspaceFile(backend, "/timing/overview.json")
      );

      expect(Array.isArray(overview)).toBe(true);
      expect(overview.length).toBe(1);
      expect(overview[0].file).toBe("test/example.test.ts");
      expect(overview[0].tests.length).toBe(3);
    } finally {
      cleanup();
    }
  });

  test("filters slow tests into timing/slow-tests.json", async () => {
    const timing = makeTestTiming({
      tests: [
        { name: "fast test", duration: 20, status: "pass" },
        { name: "slow test", duration: 500, status: "pass" },
        { name: "medium test", duration: 150, status: "pass" },
      ],
    });
    const profile = makeCorrelatedProfile();
    const testSources = new Map([["test/example.test.ts", "// test"]]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
    });

    try {
      const slow = JSON.parse(
        readWorkspaceFile(backend, "/timing/slow-tests.json")
      );

      // Only tests > 100ms threshold
      expect(slow.length).toBe(2);
      // Sorted by duration descending
      expect(slow[0].name).toBe("slow test");
      expect(slow[0].duration).toBe(500);
      expect(slow[1].name).toBe("medium test");
      expect(slow[1].duration).toBe(150);
    } finally {
      cleanup();
    }
  });

  test("creates profiles/index.json manifest", async () => {
    const timing = makeTestTiming();
    const profile = makeCorrelatedProfile();
    const testSources = new Map([["test/example.test.ts", "// test"]]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
    });

    try {
      const index = JSON.parse(
        readWorkspaceFile(backend, "/profiles/index.json")
      );

      expect(Array.isArray(index)).toBe(true);
      expect(index.length).toBe(1);
      expect(index[0].testFile).toBe("test/example.test.ts");
    } finally {
      cleanup();
    }
  });

  test("writes per-file CPU profile summaries", async () => {
    const timing = makeTestTiming();
    const profile = makeCorrelatedProfile();
    const testSources = new Map([["test/example.test.ts", "// test"]]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
    });

    try {
      const profileFiles = listWorkspaceDir(backend, "/profiles/").filter(
        (f) => f !== "index.json"
      );
      expect(profileFiles.length).toBe(1);

      // Verify the profile content is valid JSON with expected fields
      const profileContent = JSON.parse(
        readWorkspaceFile(backend, `/profiles/${profileFiles[0]}`)
      );
      expect(profileContent.profilePath).toBeDefined();
      expect(profileContent.duration).toBeDefined();
    } finally {
      cleanup();
    }
  });

  test("includes test source files in /tests/", async () => {
    const timing = makeTestTiming();
    const profile = makeCorrelatedProfile();
    const testSources = new Map([
      ["test/example.test.ts", "import { test } from 'vitest';"],
    ]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
    });

    try {
      const content = readWorkspaceFile(backend, "/tests/example.test.ts");
      expect(content).toBe("import { test } from 'vitest';");
    } finally {
      cleanup();
    }
  });

  test("includes source files for hot functions above threshold", async () => {
    const timing = makeTestTiming();
    const hotFn = makeHotFunction({ selfPercent: 15, scriptUrl: "/project/src/utils.ts" });
    const profile = makeCorrelatedProfile({
      summary: makeProfileSummary({ hotFunctions: [hotFn] }),
    });
    const testSources = new Map([["test/example.test.ts", "// test"]]);
    const sourcePaths = new Map([
      ["/project/src/utils.ts", "export function hotFn() {}"],
    ]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
      sourcePaths,
    });

    try {
      const content = readWorkspaceFile(backend, "/src/utils.ts");
      expect(content).toBe("export function hotFn() {}");
    } finally {
      cleanup();
    }
  });

  test("excludes source files for hot functions below threshold", async () => {
    const timing = makeTestTiming();
    const hotFn = makeHotFunction({ selfPercent: 0.5, scriptUrl: "/project/src/minor.ts" });
    const profile = makeCorrelatedProfile({
      summary: makeProfileSummary({ hotFunctions: [hotFn] }),
    });
    const testSources = new Map([["test/example.test.ts", "// test"]]);
    const sourcePaths = new Map([
      ["/project/src/minor.ts", "export function minorFn() {}"],
    ]);

    const { backend, cleanup } = await createVitestWorkspace({
      testTiming: [timing],
      profiles: [profile],
      testSources,
      sourcePaths,
    });

    try {
      const files = listWorkspaceDir(backend, "/src/");
      expect(files.length).toBe(0);
    } finally {
      cleanup();
    }
  });
});

describe("mergeHotFunctions", () => {
  test("deduplicates functions by (scriptUrl, name, line) and sums selfTime", () => {
    const fn1 = makeHotFunction({
      functionName: "calc",
      scriptUrl: "/src/a.ts",
      lineNumber: 10,
      selfTime: 100,
      totalTime: 150,
      hitCount: 20,
    });
    const fn2 = makeHotFunction({
      functionName: "calc",
      scriptUrl: "/src/a.ts",
      lineNumber: 10,
      selfTime: 200,
      totalTime: 250,
      hitCount: 30,
    });
    const fn3 = makeHotFunction({
      functionName: "other",
      scriptUrl: "/src/b.ts",
      lineNumber: 5,
      selfTime: 50,
      totalTime: 50,
      hitCount: 10,
    });

    const profiles: CorrelatedProfile[] = [
      {
        testFile: "test/a.test.ts",
        profilePath: "/tmp/a.cpuprofile",
        summary: makeProfileSummary({ duration: 500, hotFunctions: [fn1, fn3] }),
      },
      {
        testFile: "test/b.test.ts",
        profilePath: "/tmp/b.cpuprofile",
        summary: makeProfileSummary({ duration: 500, hotFunctions: [fn2] }),
      },
    ];

    const merged = mergeHotFunctions(profiles);

    // calc should be merged (300ms total selfTime)
    const calc = merged.find((f) => f.functionName === "calc");
    expect(calc).toBeDefined();
    expect(calc!.selfTime).toBe(300);
    expect(calc!.hitCount).toBe(50);

    // other should remain as-is
    const other = merged.find((f) => f.functionName === "other");
    expect(other).toBeDefined();
    expect(other!.selfTime).toBe(50);

    // Sorted by selfTime descending
    expect(merged[0]!.selfTime).toBeGreaterThanOrEqual(merged[1]!.selfTime);
  });
});
