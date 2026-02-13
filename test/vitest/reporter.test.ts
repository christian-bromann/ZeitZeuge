import { test, expect, describe, beforeEach, afterEach } from "bun:test";
import { mkdirSync, writeFileSync, existsSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ZeitZeugeReporter } from "../../src/vitest/reporter.js";

const TEMP_PREFIX = join(tmpdir(), "zeitzeuge-reporter-test-");

let tempDir: string;

function createProfileDir(): string {
  tempDir = `${TEMP_PREFIX}${Date.now()}`;
  mkdirSync(tempDir, { recursive: true });
  return tempDir;
}

function writeSampleProfile(dir: string, name: string): void {
  const profile = {
    nodes: [
      {
        id: 1,
        callFrame: { functionName: "(root)", scriptId: "0", url: "", lineNumber: -1, columnNumber: -1 },
        hitCount: 0,
        children: [2],
      },
      {
        id: 2,
        callFrame: { functionName: "testFn", scriptId: "1", url: "/test.ts", lineNumber: 1, columnNumber: 0 },
        hitCount: 10,
        children: [],
      },
    ],
    startTime: 0,
    endTime: 100000,
    samples: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2],
    timeDeltas: [10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000, 10000],
  };
  writeFileSync(join(dir, name), JSON.stringify(profile), "utf-8");
}

/**
 * Create a mock TestModule object.
 */
function createMockTestModule(
  filePath: string,
  tests: Array<{ name: string; duration: number; passed: boolean }>
) {
  return {
    moduleId: filePath,
    id: filePath,
    children: tests.map((t) => ({
      type: "test",
      name: t.name,
      fullName: t.name,
      result: { state: t.passed ? "passed" : "failed" },
      diagnostic: () => ({ duration: t.duration }),
    })),
    diagnostic: () => ({
      duration: tests.reduce((s, t) => s + t.duration, 0),
      setupDuration: 0,
    }),
  };
}

describe("ZeitZeugeReporter", () => {
  afterEach(() => {
    if (tempDir && existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  test("collectTestTiming extracts timing from TestModules", () => {
    const profileDir = createProfileDir();
    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir,
      analyzeOnFinish: false, // Don't run agent
      verbose: false,
      projectRoot: process.cwd(),
    });

    const mod = createMockTestModule("test/example.test.ts", [
      { name: "adds numbers", duration: 50, passed: true },
      { name: "handles errors", duration: 100, passed: false },
    ]);

    // @ts-ignore - accessing private method for testing
    const timing = reporter.collectTestTiming([mod]);

    expect(timing.length).toBe(1);
    expect(timing[0]!.file).toBe("test/example.test.ts");
    expect(timing[0]!.testCount).toBe(2);
    expect(timing[0]!.passCount).toBe(1);
    expect(timing[0]!.failCount).toBe(1);
    expect(timing[0]!.tests.length).toBe(2);
  });

  test("collectAndParseProfiles reads .cpuprofile files", () => {
    const profileDir = createProfileDir();
    writeSampleProfile(profileDir, "CPU.0001.cpuprofile");

    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir,
      analyzeOnFinish: false,
      verbose: false,
      projectRoot: process.cwd(),
    });

    const timing = [
      {
        file: "test/example.test.ts",
        duration: 100,
        testCount: 1,
        passCount: 1,
        failCount: 0,
        setupTime: 0,
        tests: [{ name: "test", duration: 100, status: "pass" as const }],
      },
    ];

    // @ts-ignore - accessing private method for testing
    const profiles = reporter.collectAndParseProfiles(timing);

    expect(profiles.length).toBe(1);
    expect(profiles[0]!.testFile).toBe("test/example.test.ts");
    expect(profiles[0]!.summary.sampleCount).toBe(10);
  });

  test("handles missing profile directory gracefully", () => {
    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir: "/nonexistent/path",
      analyzeOnFinish: false,
      verbose: false,
      projectRoot: process.cwd(),
    });

    const timing = [
      {
        file: "test/example.test.ts",
        duration: 100,
        testCount: 1,
        passCount: 1,
        failCount: 0,
        setupTime: 0,
        tests: [{ name: "test", duration: 100, status: "pass" as const }],
      },
    ];

    // @ts-ignore - accessing private method for testing
    const profiles = reporter.collectAndParseProfiles(timing);
    expect(profiles.length).toBe(0);
  });

  test("cleanupProfileDir removes the directory", () => {
    const profileDir = createProfileDir();
    writeSampleProfile(profileDir, "test.cpuprofile");

    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir,
      analyzeOnFinish: false,
      verbose: false,
      projectRoot: process.cwd(),
    });

    expect(existsSync(profileDir)).toBe(true);

    // @ts-ignore - accessing private method for testing
    reporter.cleanupProfileDir();

    expect(existsSync(profileDir)).toBe(false);
  });

  test("onTestModuleStart records execution order", () => {
    const profileDir = createProfileDir();
    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir,
      analyzeOnFinish: false,
      verbose: false,
      projectRoot: process.cwd(),
    });

    reporter.onTestModuleStart({ moduleId: "test/a.test.ts" });
    reporter.onTestModuleStart({ moduleId: "test/b.test.ts" });
    reporter.onTestModuleStart({ moduleId: "test/c.test.ts" });

    // @ts-ignore - accessing private field for testing
    expect(reporter.executionOrder).toEqual([
      "test/a.test.ts",
      "test/b.test.ts",
      "test/c.test.ts",
    ]);
  });

  test("does not duplicate execution order entries", () => {
    const profileDir = createProfileDir();
    const reporter = new ZeitZeugeReporter({
      output: "/tmp/test-report.md",
      profileDir,
      analyzeOnFinish: false,
      verbose: false,
      projectRoot: process.cwd(),
    });

    reporter.onTestModuleStart({ moduleId: "test/a.test.ts" });
    reporter.onTestModuleStart({ moduleId: "test/a.test.ts" });

    // @ts-ignore - accessing private field for testing
    expect(reporter.executionOrder.length).toBe(1);
  });
});
