/**
 * Adapts Bun's JSC profiling data to the V8 CpuProfileSummary format
 * used by the shared zeitzeuge analysis pipeline.
 *
 * Bun uses JavaScriptCore (JSC) instead of V8, but the `bun:jsc` profile()
 * API outputs a compatible format that closely mirrors V8's .cpuprofile.
 * This adapter normalizes any JSC-specific differences.
 *
 * If the profile data is already in V8 format (e.g., when Bun outputs
 * V8-compatible profiles), it passes through unchanged.
 */

import type { CpuProfileSummary } from '@zeitzeuge/utils';

interface V8LikeProfile {
  nodes: Array<{
    id: number;
    callFrame: {
      functionName: string;
      scriptId: string;
      url: string;
      lineNumber: number;
      columnNumber: number;
    };
    hitCount: number;
    children?: number[];
    positionTicks?: Array<{ line: number; ticks: number }>;
  }>;
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

/**
 * Parse a Bun/JSC profile into the standard CpuProfileSummary format.
 *
 * Delegates to the shared V8 profile parser since Bun's profile output
 * uses the same structure as V8's .cpuprofile format.
 */
export async function parseBunProfile(
  profile: V8LikeProfile,
  profilePath: string,
): Promise<CpuProfileSummary> {
  const { parseCpuProfile } = await import('../../vitest/src/profile-parser.js');
  return parseCpuProfile(profile, profilePath);
}
