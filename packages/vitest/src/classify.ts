/**
 * Classify script URLs into source categories so the Deep Agent can
 * distinguish application code (what the user cares about) from
 * dependencies, test files, and framework internals.
 */

import { resolve, relative } from 'node:path';
import type { SourceCategory } from './types.js';

/** Patterns that identify test files. */
const TEST_FILE_PATTERNS = [/\.test\./, /\.spec\./, /\.bench\./, /__tests__\//, /__mocks__\//];

/** Patterns that identify framework internals (vitest, tinybench, v8). */
const FRAMEWORK_PATTERNS = [
  /\/vitest\//,
  /\/tinybench\//,
  /\/vite\//,
  /\/@vitest\//,
  /node:internal\//,
  /node:v8/,
  /node:worker_threads/,
  /\.XdZDrNZV\./, // vitest bundled chunks
  /\.CJqBMi0u\./, // vitest bundled chunks
];

/**
 * Classify a script URL (file path or file:// URL) into a source category.
 *
 * @param scriptUrl - The URL or file path from the V8 profile
 * @param projectRoot - The project root directory (absolute path)
 * @param testFiles - Optional set of known test file paths for more accurate classification
 */
export function classifyScript(
  scriptUrl: string,
  projectRoot: string,
  testFiles?: Set<string>,
): SourceCategory {
  if (!scriptUrl) return 'unknown';

  // Normalize file:// URLs to paths
  let filePath = scriptUrl;
  if (filePath.startsWith('file://')) {
    try {
      filePath = new URL(filePath).pathname;
    } catch {
      // keep original
    }
  }

  // Internal V8/node builtins
  if (filePath.startsWith('node:') || filePath.startsWith('v8:')) {
    return 'framework';
  }

  // Check if it's in node_modules
  if (filePath.includes('/node_modules/') || filePath.includes('\\node_modules\\')) {
    return 'dependency';
  }

  // Check if the file is within the project root BEFORE framework patterns.
  // Project paths may coincidentally match framework patterns (e.g. a project
  // inside a directory named "vitest"), so project membership takes priority.
  const resolvedProject = resolve(projectRoot);
  const resolvedFile = resolve(filePath);
  const rel = relative(resolvedProject, resolvedFile);

  if (!rel.startsWith('..') && !rel.startsWith('/')) {
    // Check if it's a known test file
    if (testFiles) {
      if (testFiles.has(resolvedFile)) {
        return 'test';
      }
    }

    // Check test file patterns
    for (const pattern of TEST_FILE_PATTERNS) {
      if (pattern.test(filePath)) {
        return 'test';
      }
    }

    return 'application';
  }

  // Check framework patterns (vitest/tinybench internals) — only for files
  // outside the project root.
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
