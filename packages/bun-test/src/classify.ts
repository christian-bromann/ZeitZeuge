/**
 * Classify script URLs into source categories.
 *
 * Extended from the vitest version to also recognize bun:test and bun:jsc internals.
 */

import { resolve, relative } from 'node:path';
import type { SourceCategory } from '@zeitzeuge/utils';

const TEST_FILE_PATTERNS = [/\.test\./, /\.spec\./, /\.bench\./, /__tests__\//, /__mocks__\//];

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
  /\.XdZDrNZV\./,
  /\.CJqBMi0u\./,
];

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
