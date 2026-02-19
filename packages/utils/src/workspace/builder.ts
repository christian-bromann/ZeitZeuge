/**
 * Generic workspace builder for Deep Agent analysis.
 *
 * Creates a VfsSandbox populated with virtual files and returns
 * a BackendProtocol-compatible sandbox for use with createDeepAgent.
 * Both the Vitest and CLI agents use this to avoid duplicating
 * workspace boilerplate.
 */

import type { BackendProtocol, FileInfo, GrepMatch } from 'deepagents';
import { VfsSandbox, type VfsSandboxOptions } from '@langchain/node-vfs';

/**
 * VfsSandbox subclass that normalizes absolute paths to relative ones.
 *
 * BaseSandbox.read/lsInfo/grepRaw/globInfo build shell commands (awk, find,
 * grep) from the file path and run them via this.execute(). VfsSandbox.execute()
 * runs commands in a temp directory, so absolute paths like "/src/index.js"
 * resolve against the OS root instead of the workspace. Stripping the leading
 * "/" makes them relative to the temp-dir cwd.
 */
class PerfAgentSandbox extends VfsSandbox {
  static #toRelative(p: string): string {
    const stripped = p.startsWith('/') ? p.slice(1) : p;
    return stripped || '.';
  }

  override async read(filePath: string, offset: number = 0, limit: number = 500): Promise<string> {
    return super.read(PerfAgentSandbox.#toRelative(filePath), offset, limit);
  }

  override async lsInfo(dirPath: string): Promise<FileInfo[]> {
    return super.lsInfo(PerfAgentSandbox.#toRelative(dirPath));
  }

  override async grepRaw(
    pattern: string,
    searchPath: string = '/',
    glob: string | null = null,
  ): Promise<GrepMatch[] | string> {
    return super.grepRaw(pattern, PerfAgentSandbox.#toRelative(searchPath), glob);
  }

  override async globInfo(pattern: string, searchPath: string = '/'): Promise<FileInfo[]> {
    return super.globInfo(pattern, PerfAgentSandbox.#toRelative(searchPath));
  }

  static override async create(options?: VfsSandboxOptions): Promise<PerfAgentSandbox> {
    const sandbox = new PerfAgentSandbox(options);
    await sandbox.initialize();
    return sandbox;
  }
}

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
  const sandbox = await PerfAgentSandbox.create({ initialFiles: files });

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
