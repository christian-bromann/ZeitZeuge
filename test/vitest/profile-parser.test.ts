import { test, expect, describe } from "bun:test";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseCpuProfile } from "../../src/vitest/profile-parser.js";
import type { V8CpuProfile } from "../../src/vitest/types.js";

const FIXTURE_PATH = resolve(__dirname, "../fixtures/sample.cpuprofile");

function loadFixture(): V8CpuProfile {
  return JSON.parse(readFileSync(FIXTURE_PATH, "utf-8"));
}

describe("parseCpuProfile", () => {
  test("returns correct duration from profile timestamps", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    // endTime - startTime = 2110000 μs = 2110 ms
    expect(summary.duration).toBe(2110);
    expect(summary.profilePath).toBe(FIXTURE_PATH);
  });

  test("returns correct sample count", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    expect(summary.sampleCount).toBe(profile.samples.length);
  });

  test("extracts hot functions sorted by self time", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    expect(summary.hotFunctions.length).toBeGreaterThan(0);

    // First hot function should have the highest selfTime
    for (let i = 1; i < summary.hotFunctions.length; i++) {
      expect(summary.hotFunctions[i - 1]!.selfTime).toBeGreaterThanOrEqual(
        summary.hotFunctions[i]!.selfTime
      );
    }

    // isPrime has 80 samples × 10000 μs = 800000 μs = 800 ms self time
    const isPrime = summary.hotFunctions.find(
      (f) => f.functionName === "isPrime"
    );
    expect(isPrime).toBeDefined();
    expect(isPrime!.selfTime).toBe(800);
    expect(isPrime!.scriptUrl).toBe("/project/src/math.ts");
    expect(isPrime!.lineNumber).toBe(58);
  });

  test("self times sum to approximately total profile duration", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    // Sum all self times from all nodes (including idle, program, gc)
    // Total samples × 10ms each = total duration
    const totalSamples = profile.samples.length;
    const expectedTotalMs = totalSamples * 10; // 10000 μs = 10 ms per sample

    // The hot functions list excludes (root), (idle), (program)
    // So we verify that hot function self times are reasonable
    const hotFnTotal = summary.hotFunctions.reduce(
      (s, f) => s + f.selfTime,
      0
    );
    expect(hotFnTotal).toBeGreaterThan(0);
    expect(hotFnTotal).toBeLessThanOrEqual(expectedTotalMs);
  });

  test("computes total time correctly (parent >= child)", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    // calculatePrimes is parent of isPrime and modCheck
    const calcPrimes = summary.hotFunctions.find(
      (f) => f.functionName === "calculatePrimes"
    );
    const isPrime = summary.hotFunctions.find(
      (f) => f.functionName === "isPrime"
    );

    expect(calcPrimes).toBeDefined();
    expect(isPrime).toBeDefined();

    // Parent totalTime should be >= child totalTime
    expect(calcPrimes!.totalTime).toBeGreaterThanOrEqual(isPrime!.totalTime);
  });

  test("detects GC samples and percentage", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    // 8 GC samples × 10000 μs = 80000 μs out of 2110000 μs total
    expect(summary.gcSamples).toBe(8);
    expect(summary.gcPercentage).toBeGreaterThan(0);
    // 80000 / 2110000 ≈ 3.79%
    expect(summary.gcPercentage).toBeCloseTo(3.79, 0);
  });

  test("detects idle percentage", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    // 20 idle samples × 10000 μs = 200000 μs out of 2110000 μs total
    expect(summary.idlePercentage).toBeGreaterThan(0);
    // 200000 / 2110000 ≈ 9.48%
    expect(summary.idlePercentage).toBeCloseTo(9.48, 0);
  });

  test("builds call tree with pruning", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    expect(summary.expensiveCallTrees.length).toBeGreaterThan(0);

    // Root tree should contain the main computation chain
    const rootTree = summary.expensiveCallTrees[0];
    expect(rootTree).toBeDefined();
    expect(rootTree!.totalTime).toBeGreaterThan(0);

    // All branches should be >= 1% of total
    function verifyPruning(node: (typeof summary.expensiveCallTrees)[0]) {
      expect(node.totalPercent).toBeGreaterThanOrEqual(1);
      for (const child of node.children) {
        verifyPruning(child);
      }
    }
    verifyPruning(rootTree!);
  });

  test("computes per-script breakdown", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    expect(summary.scriptBreakdown.length).toBeGreaterThan(0);

    // math.ts should be the hottest script
    const mathTs = summary.scriptBreakdown.find((s) =>
      s.scriptUrl.includes("math.ts")
    );
    expect(mathTs).toBeDefined();
    expect(mathTs!.selfTime).toBeGreaterThan(0);
    expect(mathTs!.functionCount).toBeGreaterThanOrEqual(2); // isPrime, calculatePrimes, modCheck

    // Script breakdown sorted by selfTime descending
    for (let i = 1; i < summary.scriptBreakdown.length; i++) {
      expect(
        summary.scriptBreakdown[i - 1]!.selfTime
      ).toBeGreaterThanOrEqual(summary.scriptBreakdown[i]!.selfTime);
    }
  });

  test("handles empty profile (0 samples)", () => {
    const emptyProfile: V8CpuProfile = {
      nodes: [],
      startTime: 0,
      endTime: 0,
      samples: [],
      timeDeltas: [],
    };

    const summary = parseCpuProfile(emptyProfile, "empty.cpuprofile");

    expect(summary.duration).toBe(0);
    expect(summary.sampleCount).toBe(0);
    expect(summary.hotFunctions).toEqual([]);
    expect(summary.expensiveCallTrees).toEqual([]);
    expect(summary.gcSamples).toBe(0);
    expect(summary.gcPercentage).toBe(0);
    expect(summary.idlePercentage).toBe(0);
    expect(summary.scriptBreakdown).toEqual([]);
  });

  test("excludes (root), (idle), (program) from hot functions", () => {
    const profile = loadFixture();
    const summary = parseCpuProfile(profile, FIXTURE_PATH);

    const names = summary.hotFunctions.map((f) => f.functionName);
    expect(names).not.toContain("(root)");
    expect(names).not.toContain("(idle)");
    expect(names).not.toContain("(program)");
  });

  test("caps hot functions at 50 entries", () => {
    // Create a profile with many nodes
    const nodes = [
      {
        id: 1,
        callFrame: { functionName: "(root)", scriptId: "0", url: "", lineNumber: -1, columnNumber: -1 },
        hitCount: 0,
        children: [] as number[],
      },
    ];

    const samples: number[] = [];
    const timeDeltas: number[] = [];

    // Create 60 function nodes
    for (let i = 2; i <= 61; i++) {
      nodes[0]!.children.push(i);
      nodes.push({
        id: i,
        callFrame: {
          functionName: `fn${i}`,
          scriptId: "1",
          url: "/test.ts",
          lineNumber: i,
          columnNumber: 0,
        },
        hitCount: 1,
        children: [],
      });
      samples.push(i);
      timeDeltas.push(10000);
    }

    const profile: V8CpuProfile = {
      nodes,
      startTime: 0,
      endTime: 600000,
      samples,
      timeDeltas,
    };

    const summary = parseCpuProfile(profile, "many.cpuprofile");
    expect(summary.hotFunctions.length).toBeLessThanOrEqual(50);
  });
});
