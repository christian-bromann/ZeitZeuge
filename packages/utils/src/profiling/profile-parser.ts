/**
 * Parse V8 .cpuprofile JSON files into structured summaries
 * suitable for Deep Agent analysis.
 *
 * This is the shared implementation used by all test runner integrations
 * (vitest, node:test, bun:test). The V8 CPU profile format is identical
 * regardless of which test runner produced it.
 */

import type {
  CpuProfileSummary,
  HotFunction,
  CallerFrame,
  CallTreeNode,
  ScriptTimeSummary,
} from '../types.js';

/** Raw V8 CPU profile as written by --cpu-prof. */
export interface V8CpuProfile {
  nodes: V8CpuProfileNode[];
  startTime: number;
  endTime: number;
  samples: number[];
  timeDeltas: number[];
}

/** A single node in the V8 CPU profile call tree. */
export interface V8CpuProfileNode {
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
  positionTicks?: Array<{
    line: number;
    ticks: number;
  }>;
}

const MAX_HOT_FUNCTIONS = 50;
const MAX_CALL_TREES = 10;
const CALL_TREE_PRUNE_THRESHOLD = 0.005;
const MAX_CALLER_CHAIN_DEPTH = 10;

interface NodeStats {
  node: V8CpuProfileNode;
  selfTime: number;
  totalTime: number;
  parentIds: Set<number>;
}

export function parseCpuProfile(profile: V8CpuProfile, profilePath: string): CpuProfileSummary {
  if (!profile.samples || profile.samples.length === 0) {
    return emptySummary(profilePath);
  }

  const totalDurationUs = profile.endTime - profile.startTime;
  const totalDurationMs = totalDurationUs / 1000;

  const statsMap = buildNodeStats(profile);
  computeSelfTime(profile, statsMap);
  computeTotalTime(profile, statsMap);

  const hotFunctions = extractHotFunctions(statsMap, totalDurationUs);
  const expensiveCallTrees = extractCallTrees(profile, statsMap, totalDurationUs);
  const { gcSamples, gcTimeUs, idleTimeUs } = computeSpecialCategories(profile, statsMap);
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

function computeSelfTime(profile: V8CpuProfile, statsMap: Map<number, NodeStats>): void {
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

function computeTotalTime(profile: V8CpuProfile, statsMap: Map<number, NodeStats>): void {
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

    stats.totalTime = stats.selfTime;
    const children = stats.node.children ?? [];
    for (const childId of children) {
      const childStats = statsMap.get(childId);
      if (childStats) {
        stats.totalTime += childStats.totalTime;
      }
    }

    for (const parentId of stats.parentIds) {
      const remaining = (childCount.get(parentId) ?? 1) - 1;
      childCount.set(parentId, remaining);
      if (remaining <= 0) {
        queue.push(parentId);
      }
    }
  }
}

const META_FUNCTIONS = new Set(['(root)', '(idle)', '(program)']);

function buildCallerChain(nodeId: number, statsMap: Map<number, NodeStats>): CallerFrame[] {
  const chain: CallerFrame[] = [];
  const visited = new Set<number>();
  let currentId = nodeId;

  for (let depth = 0; depth < MAX_CALLER_CHAIN_DEPTH; depth++) {
    const stats = statsMap.get(currentId);
    if (!stats || stats.parentIds.size === 0) break;

    let bestParentId: number | null = null;
    let bestTotalTime = -1;
    for (const pid of stats.parentIds) {
      if (visited.has(pid)) continue;
      const parentStats = statsMap.get(pid);
      if (parentStats && parentStats.totalTime > bestTotalTime) {
        bestTotalTime = parentStats.totalTime;
        bestParentId = pid;
      }
    }

    if (bestParentId === null) break;

    visited.add(bestParentId);
    const parentStats = statsMap.get(bestParentId)!;
    const parentFn = parentStats.node.callFrame.functionName;

    if (META_FUNCTIONS.has(parentFn)) break;

    if (parentStats.node.callFrame.url) {
      chain.push({
        functionName: parentFn || '(anonymous)',
        scriptUrl: parentStats.node.callFrame.url,
        lineNumber: parentStats.node.callFrame.lineNumber,
      });
    }

    currentId = bestParentId;
  }

  return chain;
}

function extractHotFunctions(
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number,
): HotFunction[] {
  const results: HotFunction[] = [];

  for (const [nodeId, stats] of statsMap.entries()) {
    if (stats.selfTime <= 0) continue;

    const fn = stats.node.callFrame.functionName;
    if (META_FUNCTIONS.has(fn)) continue;

    const callerChain = buildCallerChain(nodeId, statsMap);

    results.push({
      functionName: stats.node.callFrame.functionName || '(anonymous)',
      scriptUrl: stats.node.callFrame.url,
      lineNumber: stats.node.callFrame.lineNumber,
      columnNumber: stats.node.callFrame.columnNumber,
      selfTime: round(stats.selfTime / 1000),
      totalTime: round(stats.totalTime / 1000),
      hitCount: stats.node.hitCount,
      selfPercent: totalDurationUs > 0 ? round((stats.selfTime / totalDurationUs) * 100) : 0,
      ...(callerChain.length > 0 ? { callerChain } : {}),
    });
  }

  results.sort((a, b) => b.selfTime - a.selfTime);
  return results.slice(0, MAX_HOT_FUNCTIONS);
}

function extractCallTrees(
  _profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number,
): CallTreeNode[] {
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

  trees.sort((a, b) => b.totalTime - a.totalTime);
  return trees.slice(0, MAX_CALL_TREES);
}

function buildCallTreeNode(
  nodeId: number,
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number,
): CallTreeNode | null {
  const stats = statsMap.get(nodeId);
  if (!stats) return null;

  const totalPercent = totalDurationUs > 0 ? stats.totalTime / totalDurationUs : 0;
  if (totalPercent < CALL_TREE_PRUNE_THRESHOLD) return null;

  const children: CallTreeNode[] = [];
  for (const childId of stats.node.children ?? []) {
    const childTree = buildCallTreeNode(childId, statsMap, totalDurationUs);
    if (childTree) {
      children.push(childTree);
    }
  }

  children.sort((a, b) => b.totalTime - a.totalTime);

  return {
    functionName: stats.node.callFrame.functionName || '(anonymous)',
    scriptUrl: stats.node.callFrame.url,
    lineNumber: stats.node.callFrame.lineNumber,
    totalTime: round(stats.totalTime / 1000),
    totalPercent: round(totalPercent * 100),
    children,
  };
}

function computeSpecialCategories(
  _profile: V8CpuProfile,
  statsMap: Map<number, NodeStats>,
): { gcSamples: number; gcTimeUs: number; idleTimeUs: number } {
  let gcSamples = 0;
  let gcTimeUs = 0;
  let idleTimeUs = 0;

  for (const stats of statsMap.values()) {
    const fn = stats.node.callFrame.functionName;
    if (fn.includes('(garbage collector)') || fn === '(GC)') {
      gcSamples += stats.node.hitCount;
      gcTimeUs += stats.selfTime;
    }

    if (fn === '(idle)') {
      idleTimeUs += stats.selfTime;
    }
  }

  return { gcSamples, gcTimeUs, idleTimeUs };
}

function buildScriptBreakdown(
  statsMap: Map<number, NodeStats>,
  totalDurationUs: number,
): ScriptTimeSummary[] {
  const scriptMap = new Map<string, { selfTime: number; functions: Set<string> }>();

  for (const stats of statsMap.values()) {
    const url = stats.node.callFrame.url;
    if (!url) continue;

    let entry = scriptMap.get(url);
    if (!entry) {
      entry = { selfTime: 0, functions: new Set() };
      scriptMap.set(url, entry);
    }
    entry.selfTime += stats.selfTime;
    if (stats.selfTime > 0) {
      entry.functions.add(
        `${stats.node.callFrame.functionName}:${stats.node.callFrame.lineNumber}`,
      );
    }
  }

  const results: ScriptTimeSummary[] = [];
  for (const [scriptUrl, data] of scriptMap) {
    results.push({
      scriptUrl,
      selfTime: round(data.selfTime / 1000),
      selfPercent: totalDurationUs > 0 ? round((data.selfTime / totalDurationUs) * 100) : 0,
      functionCount: data.functions.size,
    });
  }

  results.sort((a, b) => b.selfTime - a.selfTime);
  return results;
}

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
