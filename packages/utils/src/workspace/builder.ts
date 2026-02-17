/**
 * Generic workspace builder for Deep Agent analysis.
 *
 * Creates a temporary directory populated with virtual files and returns
 * a FilesystemBackend for use with createDeepAgent. Both the Vitest and
 * CLI agents use this to avoid duplicating temp-dir boilerplate.
 */

import { FilesystemBackend, type BackendProtocol } from 'deepagents';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

export interface WorkspaceBuilderResult {
  /** Backend for use with createDeepAgent */
  backend: BackendProtocol;
  /** Clean up the temporary directory when done */
  cleanup: () => void;
  /** Absolute path to the temporary directory (for debugging) */
  tempDir: string;
}

/**
 * Create a workspace from a flat map of virtual file paths to string content.
 *
 * @param files - Map of workspace paths (e.g. "/heap/summary.json") to content
 * @param prefix - Prefix for the temp directory name (default: "zeitzeuge-workspace-")
 * @returns Backend, cleanup function, and list of all file paths
 */
export function createWorkspaceFromFiles(
  files: Record<string, string>,
  prefix = 'zeitzeuge-workspace-',
): WorkspaceBuilderResult {
  const tempDir = mkdtempSync(join(tmpdir(), prefix));

  for (const [filePath, content] of Object.entries(files)) {
    const relPath = filePath.startsWith('/') ? filePath.slice(1) : filePath;
    const fullPath = join(tempDir, relPath);
    mkdirSync(join(fullPath, '..'), { recursive: true });
    writeFileSync(fullPath, content, 'utf-8');
  }

  const backend = new FilesystemBackend({
    rootDir: tempDir,
    virtualMode: true,
  });

  const cleanup = () => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup errors
    }
  };

  return { backend, cleanup, tempDir };
}

/**
 * Return all file paths from a workspace files map.
 *
 * Useful for file list injection — the caller can filter by prefix
 * (e.g. "/scripts/", "/src/") to build categorized file lists.
 */
export function listWorkspaceFiles(files: Record<string, string>): string[] {
  return Object.keys(files).sort();
}
