/**
 * Parse V8 .cpuprofile JSON files into structured summaries
 * suitable for Deep Agent analysis.
 */

import type {
  V8CpuProfile,
  V8CpuProfileNode,
  CpuProfileSummary,
  HotFunction,
  CallTreeNode,
  ScriptTimeSummary,
} from "./types.js";

/** Maximum number of hot functions to return. */
const MAX_HOT_FUNCTIONS = 50;

/** Maximum number of expensive call trees to return. */
const MAX_CALL_TREES = 10;

/** Minimum percentage of total time for a call tree branch to be included. */
const CALL_TREE_PRUNE_THRESHOLD = 0.01; // 1%

// ── Internal bookkeeping per node ──

interface NodeStats {
  node: V8CpuProfileNode;
  selfTime: number; // in μs
  totalTime: number; // in μs
  parentIds: Set<number>;
}

// ── Public API ─────────────────────────────────────────────────

/**
 * Parse a V8 CPU profile into a structured summary.
 *
 * @param profile - The raw V8 CPU profile object
 * @param profilePath - File path to the .cpuprofile (for metadata)
 */
export function parseCpuProfile(
  profile: V8CpuProfile,
  profilePath: string
): CpuProfileSummary {
  if (!profile.samples || profile.samples.length === 0) {
    return emptySummary(profilePath);
  }

  const totalDurationUs = profile.endTime - profile.startTime;
  const totalDurationMs = totalDurationUs / 1000;

  // 1. Build node map with stats
  const statsMap = buildNodeStats(profile);

  // 2. Compute self time from samples + timeDeltas
  computeSelfTime(profile, statsMap);

  // 3. Compute total time (bottom-up)
  computeTotalTime(profile, statsMap);

  // 4. Extract hot functions
  const hotFunctions = extractHotFunctions(statsMap, totalDurationUs);

  // 5. Extract expensive call trees
  const expensiveCallTrees = extractCallTrees(
    profile,
    statsMap,
    totalDurationUs
  );

  // 6. Compute GC / idle
  const { gcSamples, gcTimeUs, idleTimeUs } = computeSpecialCategories(
    profile,
    statsMap
  );

  // 7. Script breakdown
  const scriptBreakdown = buildScriptBreakdown(statsMap, totalDurationUs);

  return {
    profilePath,
    duration: round(totalDurationMs),
    sampleCount: profile.samples.length,
    hotFunctions,
    expensiveCallTrees,
    gcSamples,
    gcPercentage: totalDurationUs > 0 ? round((gcTimeUs / totalDurationUs) * 100) : 0,
    idlePercentage: totalDurationUs > 0 ? round((idleTimeUs / totalDurationUs) * 100) : 0,
    scriptBreakdown,
  };
}

// ── Step 1: Build node map ────────────────────────────────────

function buildNodeStats(profile: V8CpuProfile): Map<number, NodeStats> {
  const statsMap = new Map<number, NodeStats>();

  for (const node of profile.nodes) {
    statsMap.set(node.id, {
      node,
      selfTime: 0,
      totalTime: 0,
      parentIds: new Set(),
    });
  }

  // Record parent relationships
  for (const node of profile.nodes) {
    if (node.children) {
      for (const childId of node.children) {
        const childStats = statsMap.get(childId);
        if (childStats) {
          childStats.parentIds.add(node.id);
        }
      }
    }
  }

  return statsMap;
}

// ── Step 2: Compute self time ─────────────────────────────────

function computeSelfTime(
  profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>
): void {
  const { samples, timeDeltas } = profile;

  for (let i = 0; i < samples.length; i++) {
    const nodeId = samples[i]!;
    const delta = timeDeltas[i] ?? 0;
    const stats = statsMap.get(nodeId);
    if (stats) {
      stats.selfTime += Math.max(0, delta);
    }
  }
}

// ── Step 3: Compute total time (bottom-up) ────────────────────

function computeTotalTime(
  profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>
): void {
  // Topological sort: process leaves first, then parents
  // Use in-degree approach based on children count
  const childCount = new Map<number, number>();
  const queue: number[] = [];

  for (const node of profile.nodes) {
    const numChildren = node.children?.length ?? 0;
    childCount.set(node.id, numChildren);
    if (numChildren === 0) {
      queue.push(node.id);
    }
  }

  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    const stats = statsMap.get(nodeId);
    if (!stats) continue;

    // totalTime = selfTime + sum of children's totalTime
    stats.totalTime = stats.selfTime;
    const children = stats.node.children ?? [];
    for (const childId of children) {
      const childStats = statsMap.get(childId);
      if (childStats) {
        stats.totalTime += childStats.totalTime;
      }
    }

    // Decrement parent child counts; add to queue when all children processed
    for (const parentId of stats.parentIds) {
      const remaining = (childCount.get(parentId) ?? 1) - 1;
      childCount.set(parentId, remaining);
      if (remaining <= 0) {
        queue.push(parentId);
      }
    }
  }
}

// ── Step 4: Extract hot functions ─────────────────────────────

function extractHotFunctions(
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number
): HotFunction[] {
  const results: HotFunction[] = [];

  for (const stats of statsMap.values()) {
    if (stats.selfTime <= 0) continue;

    // Skip internal/meta nodes
    const fn = stats.node.callFrame.functionName;
    if (fn === "(root)" || fn === "(idle)" || fn === "(program)") continue;

    results.push({
      functionName: stats.node.callFrame.functionName || "(anonymous)",
      scriptUrl: stats.node.callFrame.url,
      lineNumber: stats.node.callFrame.lineNumber,
      columnNumber: stats.node.callFrame.columnNumber,
      selfTime: round(stats.selfTime / 1000),
      totalTime: round(stats.totalTime / 1000),
      hitCount: stats.node.hitCount,
      selfPercent:
        totalDurationUs > 0
          ? round((stats.selfTime / totalDurationUs) * 100)
          : 0,
    });
  }

  // Sort by selfTime descending
  results.sort((a, b) => b.selfTime - a.selfTime);

  return results.slice(0, MAX_HOT_FUNCTIONS);
}

// ── Step 5: Extract expensive call trees ──────────────────────

function extractCallTrees(
  profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number
): CallTreeNode[] {
  // Find root nodes (no parents)
  const rootIds: number[] = [];
  for (const stats of statsMap.values()) {
    if (stats.parentIds.size === 0) {
      rootIds.push(stats.node.id);
    }
  }

  const trees: CallTreeNode[] = [];
  for (const rootId of rootIds) {
    const tree = buildCallTreeNode(rootId, statsMap, totalDurationUs);
    if (tree && tree.totalTime > 0) {
      trees.push(tree);
    }
  }

  // Sort by totalTime descending
  trees.sort((a, b) => b.totalTime - a.totalTime);

  return trees.slice(0, MAX_CALL_TREES);
}

function buildCallTreeNode(
  nodeId: number,
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number
): CallTreeNode | null {
  const stats = statsMap.get(nodeId);
  if (!stats) return null;

  const totalPercent =
    totalDurationUs > 0 ? stats.totalTime / totalDurationUs : 0;

  // Prune branches below threshold
  if (totalPercent < CALL_TREE_PRUNE_THRESHOLD) return null;

  const children: CallTreeNode[] = [];
  for (const childId of stats.node.children ?? []) {
    const childTree = buildCallTreeNode(childId, statsMap, totalDurationUs);
    if (childTree) {
      children.push(childTree);
    }
  }

  // Sort children by totalTime descending
  children.sort((a, b) => b.totalTime - a.totalTime);

  return {
    functionName: stats.node.callFrame.functionName || "(anonymous)",
    scriptUrl: stats.node.callFrame.url,
    lineNumber: stats.node.callFrame.lineNumber,
    totalTime: round(stats.totalTime / 1000),
    totalPercent: round(totalPercent * 100),
    children,
  };
}

// ── Step 6: GC and idle ───────────────────────────────────────

function computeSpecialCategories(
  profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>
): { gcSamples: number; gcTimeUs: number; idleTimeUs: number } {
  let gcSamples = 0;
  let gcTimeUs = 0;
  let idleTimeUs = 0;

  for (const stats of statsMap.values()) {
    const fn = stats.node.callFrame.functionName;
    const url = stats.node.callFrame.url;

    if (fn.includes("(garbage collector)") || fn === "(GC)") {
      gcSamples += stats.node.hitCount;
      gcTimeUs += stats.selfTime;
    }

    if (fn === "(idle)") {
      idleTimeUs += stats.selfTime;
    }
  }

  return { gcSamples, gcTimeUs, idleTimeUs };
}

// ── Step 7: Script breakdown ──────────────────────────────────

function buildScriptBreakdown(
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number
): ScriptTimeSummary[] {
  const scriptMap = new Map<
    string,
    { selfTime: number; functions: Set<string> }
  >();

  for (const stats of statsMap.values()) {
    const url = stats.node.callFrame.url;
    if (!url) continue; // skip internal nodes without a script

    let entry = scriptMap.get(url);
    if (!entry) {
      entry = { selfTime: 0, functions: new Set() };
      scriptMap.set(url, entry);
    }
    entry.selfTime += stats.selfTime;
    if (stats.selfTime > 0) {
      entry.functions.add(
        `${stats.node.callFrame.functionName}:${stats.node.callFrame.lineNumber}`
      );
    }
  }

  const results: ScriptTimeSummary[] = [];
  for (const [scriptUrl, data] of scriptMap) {
    results.push({
      scriptUrl,
      selfTime: round(data.selfTime / 1000),
      selfPercent:
        totalDurationUs > 0
          ? round((data.selfTime / totalDurationUs) * 100)
          : 0,
      functionCount: data.functions.size,
    });
  }

  // Sort by selfTime descending
  results.sort((a, b) => b.selfTime - a.selfTime);

  return results;
}

// ── Helpers ───────────────────────────────────────────────────

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

function emptySummary(profilePath: string): CpuProfileSummary {
  return {
    profilePath,
    duration: 0,
    sampleCount: 0,
    hotFunctions: [],
    expensiveCallTrees: [],
    gcSamples: 0,
    gcPercentage: 0,
    idlePercentage: 0,
    scriptBreakdown: [],
  };
}
