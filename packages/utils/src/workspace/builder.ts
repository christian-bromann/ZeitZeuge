/**
 * Generic workspace builder for Deep Agent analysis.
 *
 * Creates a VfsSandbox populated with virtual files and returns
 * a BackendProtocol-compatible sandbox for use with createDeepAgent.
 * Both the Vitest and CLI agents use this to avoid duplicating
 * workspace boilerplate.
 */

import type { BackendProtocol } from 'deepagents';
import { VfsSandbox } from '@langchain/node-vfs';

export interface WorkspaceBuilderResult {
  /** Backend for use with createDeepAgent */
  backend: BackendProtocol;
  /** Clean up sandbox resources when done */
  cleanup: () => Promise<void>;
}

/**
 * Create a workspace from a flat map of virtual file paths to string content.
 *
 * @param files - Map of workspace paths (e.g. "heap/summary.json") to content
 * @param _prefix - Unused, kept for call-site compatibility
 * @returns Backend and async cleanup function
 */
export async function createWorkspaceFromFiles(
  files: Record<string, string>,
): Promise<WorkspaceBuilderResult> {
  const sandbox = await VfsSandbox.create({ initialFiles: files });

  const cleanup = async () => {
    try {
      await sandbox.stop();
    } catch {
      // Ignore cleanup errors
    }
  };

  return { backend: sandbox, cleanup };
}

/**
 * Return all file paths from a workspace files map.
 *
 * Useful for file list injection — the caller can filter by prefix
 * (e.g. "scripts/", "src/") to build categorized file lists.
 */
export function listWorkspaceFiles(files: Record<string, string>): string[] {
  return Object.keys(files).sort();
}
