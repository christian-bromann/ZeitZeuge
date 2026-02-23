import type { BackendProtocol } from 'deepagents';

import { FindingsSchema } from '../schema.js';
import type { Finding } from '../types.js';

const FINDINGS_DIR = '/findings';
const MERGED_FILENAME = 'merged.json';

/**
 * Read and merge all subagent finding files from the workspace.
 *
 * Each subagent writes its findings to `/findings/<name>.json`.
 * This function reads all such files, validates them, concatenates
 * the findings arrays, writes the merged result to `/findings/merged.json`,
 * and returns the combined array.
 */
export async function mergeFindings(backend: BackendProtocol): Promise<Finding[]> {
  let entries: Array<{ path: string }>;
  try {
    entries = await backend.lsInfo(FINDINGS_DIR);
  } catch {
    return [];
  }

  const jsonFiles = entries.filter(
    (e) => e.path.endsWith('.json') && !e.path.endsWith(`/${MERGED_FILENAME}`),
  );

  if (jsonFiles.length === 0) {
    return [];
  }

  const allFindings: Finding[] = [];

  for (const entry of jsonFiles) {
    const filePath = entry.path.startsWith('/') ? entry.path : `${FINDINGS_DIR}/${entry.path}`;

    try {
      const fileData = await backend.readRaw(filePath);
      const raw = fileData.content.join('\n');
      const parsed = JSON.parse(raw);
      const validated = FindingsSchema.safeParse(parsed);

      if (validated.success) {
        allFindings.push(...validated.data.findings);
      } else {
        console.warn(`[merge-findings] Skipping ${filePath}: schema validation failed`);
      }
    } catch (err) {
      console.warn(
        `[merge-findings] Skipping ${filePath}: ${err instanceof Error ? err.message : String(err)}`,
      );
    }
  }

  try {
    const mergedContent = JSON.stringify({ findings: allFindings }, null, 2);
    await backend.write(`${FINDINGS_DIR}/${MERGED_FILENAME}`, mergedContent);
  } catch {
    // Non-fatal: we still return findings even if writing the merged file fails
  }

  return allFindings;
}
