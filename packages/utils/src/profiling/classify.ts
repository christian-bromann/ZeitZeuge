/**
 * Classify script URLs into source categories so the Deep Agent can
 * distinguish application code from dependencies, test files, and
 * framework internals.
 *
 * This is the shared implementation used by all test runner integrations.
 * It recognizes vitest, node:test, bun:test, and other common frameworks.
 */

import { resolve, relative } from 'node:path';
import type { SourceCategory } from '../types.js';

/** Patterns that identify test files. */
const TEST_FILE_PATTERNS = [/\.test\./, /\.spec\./, /\.bench\./, /__tests__\//, /__mocks__\//];

/** Patterns that identify framework internals (vitest, node:test, bun:test, tinybench, v8). */
const FRAMEWORK_PATTERNS = [
  /\/vitest\//,
  /\/tinybench\//,
  /\/vite\//,
  /\/@vitest\//,
  /node:internal\//,
  /node:v8/,
  /node:worker_threads/,
  /node:test/,
  /bun:test/,
  /bun:jsc/,
  /bun:internal/,
  /\.XdZDrNZV\./, // vitest bundled chunks
  /\.CJqBMi0u\./, // vitest bundled chunks
];

/**
 * Classify a script URL (file path or file:// URL) into a source category.
 *
 * @param scriptUrl - The URL or file path from the V8/JSC profile
 * @param projectRoot - The project root directory (absolute path)
 * @param testFiles - Optional set of known test file paths for more accurate classification
 */
export function classifyScript(
  scriptUrl: string,
  projectRoot: string,
  testFiles?: Set<string>,
): SourceCategory {
  if (!scriptUrl) return 'unknown';

  let filePath = scriptUrl;
  if (filePath.startsWith('file://')) {
    try {
      filePath = new URL(filePath).pathname;
    } catch {
      // keep original
    }
  }

  if (filePath.startsWith('node:') || filePath.startsWith('v8:') || filePath.startsWith('bun:')) {
    return 'framework';
  }

  if (filePath.includes('/node_modules/') || filePath.includes('\\node_modules\\')) {
    return 'dependency';
  }

  const resolvedProject = resolve(projectRoot);
  const resolvedFile = resolve(filePath);
  const rel = relative(resolvedProject, resolvedFile);

  if (!rel.startsWith('..') && !rel.startsWith('/')) {
    if (testFiles) {
      if (testFiles.has(resolvedFile)) {
        return 'test';
      }
    }

    for (const pattern of TEST_FILE_PATTERNS) {
      if (pattern.test(filePath)) {
        return 'test';
      }
    }

    return 'application';
  }

  for (const pattern of FRAMEWORK_PATTERNS) {
    if (pattern.test(filePath)) {
      return 'framework';
    }
  }

  return 'unknown';
}

/**
 * Classify multiple scripts and return a Map of scriptUrl → category.
 */
export function classifyScripts(
  scriptUrls: string[],
  projectRoot: string,
  testFiles?: Set<string>,
): Map<string, SourceCategory> {
  const result = new Map<string, SourceCategory>();
  for (const url of scriptUrls) {
    result.set(url, classifyScript(url, projectRoot, testFiles));
  }
  return result;
}
