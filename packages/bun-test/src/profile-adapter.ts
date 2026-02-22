/**
 * Adapts Bun's profiling data to the V8 CpuProfileSummary format
 * used by the shared zeitzeuge analysis pipeline.
 *
 * Bun uses JavaScriptCore (JSC) instead of V8, but its profiling output
 * uses a V8-compatible format. This adapter delegates to the shared
 * profile parser in @zeitzeuge/utils.
 */

import { parseCpuProfile, type V8CpuProfile } from '@zeitzeuge/utils';
import type { CpuProfileSummary } from '@zeitzeuge/utils';

/**
 * Parse a Bun/JSC profile into the standard CpuProfileSummary format.
 */
export function parseBunProfile(profile: V8CpuProfile, profilePath: string): CpuProfileSummary {
  return parseCpuProfile(profile, profilePath);
}
