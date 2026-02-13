import type {
  HeapProfileSummary,
  V8HeapProfile,
  V8HeapProfileNode,
  AllocationHotspot,
  ScriptAllocationSummary,
} from './types.js';

/**
 * Parse a V8 heap profile (from Node.js `--heap-prof`) into a compact summary.
 *
 * The raw heap profile is a call tree (`head`) plus allocation samples
 * referencing node ids (`samples[].nodeId`). We attribute bytes to the node
 * referenced by each sample (self attribution) and then aggregate:
 * - top functions by allocated bytes
 * - per-script allocated bytes
 */
export function parseHeapProfile(raw: V8HeapProfile, profilePath: string): HeapProfileSummary {
  const nodeById = new Map<number, V8HeapProfileNode>();
  const parentById = new Map<number, number | null>();

  const walk = (node: V8HeapProfileNode, parent: V8HeapProfileNode | null) => {
    nodeById.set(node.id, node);
    parentById.set(node.id, parent ? parent.id : null);
    for (const child of node.children ?? []) walk(child, node);
  };

  walk(raw.head, null);

  const selfBytesByNode = new Map<number, number>();
  let totalAllocatedBytes = 0;

  for (const s of raw.samples ?? []) {
    const size = typeof s.size === 'number' ? s.size : 0;
    if (!Number.isFinite(size) || size <= 0) continue;
    totalAllocatedBytes += size;
    selfBytesByNode.set(s.nodeId, (selfBytesByNode.get(s.nodeId) ?? 0) + size);
  }

  const hotspots: AllocationHotspot[] = [];
  const scriptMap = new Map<string, { selfBytes: number; functionIds: Set<number> }>();

  for (const [nodeId, selfBytes] of selfBytesByNode.entries()) {
    const node = nodeById.get(nodeId);
    if (!node) continue;

    const cf = node.callFrame;
    const scriptUrl = cf?.url ?? '';
    const fnName = cf?.functionName ?? '(anonymous)';

    hotspots.push({
      functionName: fnName,
      scriptUrl,
      lineNumber: cf?.lineNumber ?? -1,
      columnNumber: cf?.columnNumber ?? -1,
      selfBytes,
      selfPercent: 0,
    });

    const key = scriptUrl || '(unknown)';
    const entry = scriptMap.get(key) ?? { selfBytes: 0, functionIds: new Set<number>() };
    entry.selfBytes += selfBytes;
    entry.functionIds.add(nodeId);
    scriptMap.set(key, entry);
  }

  hotspots.sort((a, b) => b.selfBytes - a.selfBytes);
  const topAllocations = hotspots.slice(0, 50);

  if (totalAllocatedBytes > 0) {
    for (const h of topAllocations) {
      h.selfPercent = round((h.selfBytes / totalAllocatedBytes) * 100);
    }
  }

  const scriptBreakdown: ScriptAllocationSummary[] = Array.from(scriptMap.entries())
    .map(([scriptUrl, data]) => ({
      scriptUrl,
      selfBytes: data.selfBytes,
      selfPercent:
        totalAllocatedBytes > 0 ? round((data.selfBytes / totalAllocatedBytes) * 100) : 0,
      functionCount: data.functionIds.size,
    }))
    .sort((a, b) => b.selfBytes - a.selfBytes);

  return {
    profilePath,
    totalAllocatedBytes: Math.round(totalAllocatedBytes),
    sampleCount: raw.samples?.length ?? 0,
    topAllocations,
    scriptBreakdown,
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}
