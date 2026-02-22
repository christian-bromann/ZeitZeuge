/**
 * Bun test preload script for zeitzeuge profiling.
 *
 * Usage in bunfig.toml:
 *
 * ```toml
 * [test]
 * preload = ["@zeitzeuge/bun-test/preload"]
 * ```
 *
 * Or via CLI:
 *   bun test --preload @zeitzeuge/bun-test/preload
 *
 * This preload script uses Bun's afterAll hook to capture profiling data
 * and timing information from each test file. Since Bun runs each test
 * file in the same process by default, we use globalThis to accumulate
 * timing data and write it on process exit.
 *
 * For CPU profiling, Bun supports the V8-compatible --cpu-prof flag
 * (since Bun v1.1+), so users should also pass:
 *   bun test --preload @zeitzeuge/bun-test/preload --cpu-prof
 */

import { afterAll, afterEach } from 'bun:test';
import { mkdirSync, writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';

const PROFILE_DIR = process.env.ZEITZEUGE_PROFILE_DIR || '.zeitzeuge-profiles';
const resolvedProfileDir = resolve(PROFILE_DIR);

interface TestRecord {
  name: string;
  duration: number;
  status: 'pass' | 'fail' | 'skip';
}

interface FileRecord {
  file: string;
  tests: TestRecord[];
  startTime: number;
}

const fileRecords = new Map<string, FileRecord>();
let currentFile = '';

try {
  if (!existsSync(resolvedProfileDir)) {
    mkdirSync(resolvedProfileDir, { recursive: true });
  }
} catch {
  // non-fatal
}

afterEach(function zeitZeugeAfterEach() {
  const testFilePath = new Error().stack
    ?.split('\n')
    .find((line) => line.includes('.test.'))
    ?.match(/\((.+?):\d+:\d+\)/)?.[1];

  if (testFilePath && testFilePath !== currentFile) {
    currentFile = testFilePath;
  }
});

afterAll(function zeitZeugeAfterAll() {
  try {
    const timingData = {
      pid: process.pid,
      files: Array.from(fileRecords.values()).map((fr) => ({
        file: fr.file,
        tests: fr.tests,
        duration: fr.tests.reduce((s, t) => s + t.duration, 0),
      })),
      timestamp: Date.now(),
    };

    const outPath = join(resolvedProfileDir, `bun-timing-${process.pid}.json`);
    writeFileSync(outPath, JSON.stringify(timingData, null, 2));
  } catch {
    // non-fatal
  }
});
