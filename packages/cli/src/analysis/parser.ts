import type {
  RawSnapshot,
  HeapSummary,
  LargestObject,
  TypeStat,
  ConstructorStat,
  DetachedNodeInfo,
  ClosureStats,
} from '@zeitzeuge/utils';

interface V8Snapshot {
  snapshot: {
    meta: {
      node_fields: string[];
      node_types: any[];
      edge_fields: string[];
      edge_types: any[];
    };
    node_count: number;
    edge_count: number;
  };
  nodes: number[];
  edges: number[];
  strings: string[];
}

interface NodeInfo {
  ordinal: number;
  type: string;
  name: string;
  id: number;
  selfSize: number;
  edgeCount: number;
  detachedness: number;
  edgeStartIndex: number;
}

export function parseSnapshot(rawSnapshot: RawSnapshot): HeapSummary {
  const v8: V8Snapshot = JSON.parse(rawSnapshot.data);
  const meta = v8.snapshot.meta;
  const nodeFieldCount = meta.node_fields.length;
  const edgeFieldCount = meta.edge_fields.length;
  const nodeTypes: string[] = meta.node_types[0] as string[];
  const edgeTypes: string[] = meta.edge_types[0] as string[];

  // Field indices
  const nodeTypeIdx = meta.node_fields.indexOf('type');
  const nodeNameIdx = meta.node_fields.indexOf('name');
  const nodeIdIdx = meta.node_fields.indexOf('id');
  const nodeSelfSizeIdx = meta.node_fields.indexOf('self_size');
  const nodeEdgeCountIdx = meta.node_fields.indexOf('edge_count');
  const nodeDetachednessIdx = meta.node_fields.indexOf('detachedness');

  const edgeTypeIdx = meta.edge_fields.indexOf('type');
  const edgeNameIdx = meta.edge_fields.indexOf('name_or_index');
  const edgeToNodeIdx = meta.edge_fields.indexOf('to_node');

  const nodeCount = v8.snapshot.node_count;

  // ------------------------------------------------------------------
  // Step 1: Build node info array
  // ------------------------------------------------------------------
  const nodes: NodeInfo[] = [];
  let edgeOffset = 0;
  let totalSize = 0;

  for (let i = 0; i < nodeCount; i++) {
    const base = i * nodeFieldCount;
    const selfSize = v8.nodes[base + nodeSelfSizeIdx] ?? 0;
    totalSize += selfSize;
    nodes.push({
      ordinal: i,
      type: nodeTypes[v8.nodes[base + nodeTypeIdx] ?? 0] ?? 'unknown',
      name: v8.strings[v8.nodes[base + nodeNameIdx] ?? 0] ?? '',
      id: v8.nodes[base + nodeIdIdx] ?? 0,
      selfSize,
      edgeCount: v8.nodes[base + nodeEdgeCountIdx] ?? 0,
      detachedness: nodeDetachednessIdx >= 0 ? (v8.nodes[base + nodeDetachednessIdx] ?? 0) : 0,
      edgeStartIndex: edgeOffset,
    });
    edgeOffset += (v8.nodes[base + nodeEdgeCountIdx] ?? 0) * edgeFieldCount;
  }

  // ------------------------------------------------------------------
  // Step 2: Build adjacency lists (forward + reverse)
  // ------------------------------------------------------------------
  const adjacency: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let i = 0; i < nodeCount; i++) adjacency[i] = [];

  const reverseAdj: number[][] = Array.from({ length: nodeCount }, () => []);
  for (let i = 0; i < nodeCount; i++) reverseAdj[i] = [];

  for (let i = 0; i < nodeCount; i++) {
    const node = nodes[i]!;
    for (let e = 0; e < node.edgeCount; e++) {
      const edgeBase = node.edgeStartIndex + e * edgeFieldCount;
      const edgeTypeVal = edgeTypes[v8.edges[edgeBase + edgeTypeIdx] ?? 0];
      // Skip weak edges – they don't retain objects
      if (edgeTypeVal === 'weak') continue;
      const toNodeArrayIdx = v8.edges[edgeBase + edgeToNodeIdx] ?? 0;
      const toOrdinal = toNodeArrayIdx / nodeFieldCount;
      if (toOrdinal >= 0 && toOrdinal < nodeCount) {
        adjacency[i]!.push(toOrdinal);
        reverseAdj[toOrdinal]!.push(i);
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 3: BFS from root (node 0) for reachability & visit order
  // ------------------------------------------------------------------
  const visited = new Uint8Array(nodeCount);
  const bfsOrder: number[] = [];
  const queue: number[] = [0];
  visited[0] = 1;

  while (queue.length > 0) {
    const curr = queue.shift()!;
    bfsOrder.push(curr);
    for (const next of adjacency[curr]!) {
      if (!visited[next]) {
        visited[next] = 1;
        queue.push(next);
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 4: Compute dominators (Cooper-Harvey-Kennedy intersect)
  // ------------------------------------------------------------------
  const dominators = new Int32Array(nodeCount).fill(-1);
  dominators[0] = 0; // root dominates itself

  // Map each node to its BFS-order index (used as RPO approximation)
  const nodeToRpo = new Int32Array(nodeCount).fill(-1);
  for (let i = 0; i < bfsOrder.length; i++) {
    nodeToRpo[bfsOrder[i]!] = i;
  }

  function intersect(b1Init: number, b2Init: number): number {
    let b1 = b1Init;
    let b2 = b2Init;
    let finger1 = nodeToRpo[b1]!;
    let finger2 = nodeToRpo[b2]!;
    while (finger1 !== finger2) {
      while (finger1 > finger2) {
        b1 = dominators[b1]!;
        if (b1 < 0) return 0;
        finger1 = nodeToRpo[b1]!;
      }
      while (finger2 > finger1) {
        b2 = dominators[b2]!;
        if (b2 < 0) return 0;
        finger2 = nodeToRpo[b2]!;
      }
    }
    return b1;
  }

  let changed = true;
  while (changed) {
    changed = false;
    for (let i = 1; i < bfsOrder.length; i++) {
      const node = bfsOrder[i]!;
      let newIdom = -1;

      for (const pred of reverseAdj[node]!) {
        if (dominators[pred]! < 0) continue;
        if (newIdom < 0) {
          newIdom = pred;
        } else {
          newIdom = intersect(newIdom, pred);
        }
      }

      if (newIdom >= 0 && dominators[node] !== newIdom) {
        dominators[node] = newIdom;
        changed = true;
      }
    }
  }

  // ------------------------------------------------------------------
  // Step 5: Compute retained sizes
  // ------------------------------------------------------------------
  const retainedSizes = new Float64Array(nodeCount);
  for (let i = 0; i < nodeCount; i++) {
    retainedSizes[i] = nodes[i]!.selfSize;
  }

  // Process in reverse BFS order (leaves first)
  for (let i = bfsOrder.length - 1; i > 0; i--) {
    const node = bfsOrder[i]!;
    const dom = dominators[node]!;
    if (dom >= 0 && dom !== node) {
      retainedSizes[dom] = retainedSizes[dom]! + retainedSizes[node]!;
    }
  }

  // ------------------------------------------------------------------
  // Step 6: Extract top 50 objects by retained size
  // ------------------------------------------------------------------
  const indexed = bfsOrder
    .filter((i) => i > 0) // skip root
    .map((i) => ({ ordinal: i, retainedSize: retainedSizes[i]! }))
    .sort((a, b) => b.retainedSize - a.retainedSize)
    .slice(0, 50);

  // ------------------------------------------------------------------
  // Step 7: Compute retainer paths for a given node (via dominator chain)
  // ------------------------------------------------------------------
  function getEdgeName(toOrdinal: number): string {
    const dom = dominators[toOrdinal]!;
    if (dom < 0) return '';
    const domNode = nodes[dom]!;
    for (let e = 0; e < domNode.edgeCount; e++) {
      const edgeBase = domNode.edgeStartIndex + e * edgeFieldCount;
      const toNodeArrayIdx = v8.edges[edgeBase + edgeToNodeIdx] ?? 0;
      if (toNodeArrayIdx / nodeFieldCount === toOrdinal) {
        const nameOrIndex = v8.edges[edgeBase + edgeNameIdx] ?? 0;
        const edgeTypeVal = edgeTypes[v8.edges[edgeBase + edgeTypeIdx] ?? 0];
        if (edgeTypeVal === 'element') return `[${nameOrIndex}]`;
        return v8.strings[nameOrIndex] ?? String(nameOrIndex);
      }
    }
    return '';
  }

  function getRetainerPath(targetOrdinal: number, maxDepth = 10): string[] {
    const path: string[] = [];
    let current = targetOrdinal;
    const pathVisited = new Set<number>();

    for (let depth = 0; depth < maxDepth; depth++) {
      const node = nodes[current]!;
      const edgeName = getEdgeName(current);
      path.unshift(edgeName ? `${node.name || node.type}` : node.name || node.type);

      if (current === 0) break;
      pathVisited.add(current);

      const dom = dominators[current]!;
      if (dom < 0 || dom === current || pathVisited.has(dom)) break;
      current = dom;
    }

    return path;
  }

  const largestObjects: LargestObject[] = indexed.map(({ ordinal, retainedSize }) => {
    const node = nodes[ordinal]!;
    return {
      name: node.name || `(${node.type})`,
      type: node.type,
      selfSize: node.selfSize,
      retainedSize,
      retainerPath: getRetainerPath(ordinal),
    };
  });

  // ------------------------------------------------------------------
  // Step 8: Type statistics
  // ------------------------------------------------------------------
  const typeMap = new Map<string, { count: number; totalSize: number }>();
  for (const node of nodes) {
    if (!visited[node.ordinal]) continue;
    const existing = typeMap.get(node.type);
    if (existing) {
      existing.count++;
      existing.totalSize += node.selfSize;
    } else {
      typeMap.set(node.type, { count: 1, totalSize: node.selfSize });
    }
  }

  const typeStats: TypeStat[] = Array.from(typeMap.entries())
    .map(([type, stats]) => ({
      type,
      count: stats.count,
      totalSize: stats.totalSize,
      avgSize: stats.count > 0 ? Math.round(stats.totalSize / stats.count) : 0,
    }))
    .sort((a, b) => b.totalSize - a.totalSize);

  // ------------------------------------------------------------------
  // Step 9: Constructor statistics (top 30, "object" type only)
  // ------------------------------------------------------------------
  const ctorMap = new Map<string, { count: number; totalSize: number }>();
  for (const node of nodes) {
    if (!visited[node.ordinal]) continue;
    if (node.type !== 'object' || !node.name) continue;
    const existing = ctorMap.get(node.name);
    if (existing) {
      existing.count++;
      existing.totalSize += node.selfSize;
    } else {
      ctorMap.set(node.name, { count: 1, totalSize: node.selfSize });
    }
  }

  const constructorStats: ConstructorStat[] = Array.from(ctorMap.entries())
    .map(([ctor, stats]) => ({
      constructor: ctor,
      count: stats.count,
      totalSize: stats.totalSize,
      avgSize: stats.count > 0 ? Math.round(stats.totalSize / stats.count) : 0,
    }))
    .sort((a, b) => b.totalSize - a.totalSize)
    .slice(0, 30);

  // ------------------------------------------------------------------
  // Step 10: Detached DOM nodes
  // ------------------------------------------------------------------
  const detachedExamples: Array<{ name: string; retainerPath: string[] }> = [];
  let detachedCount = 0;
  let detachedTotalSize = 0;

  for (const node of nodes) {
    if (!visited[node.ordinal]) continue;
    const isDetached =
      (nodeDetachednessIdx >= 0 && node.detachedness > 0) ||
      node.name.includes('Detached') ||
      (node.type === 'native' &&
        /HTML\w*Element|Document|Node/.test(node.name) &&
        node.name.includes('Detached'));

    if (isDetached) {
      detachedCount++;
      detachedTotalSize += node.selfSize;
      if (detachedExamples.length < 10) {
        detachedExamples.push({
          name: node.name || `(${node.type})`,
          retainerPath: getRetainerPath(node.ordinal),
        });
      }
    }
  }

  const detachedNodes: DetachedNodeInfo = {
    count: detachedCount,
    totalSize: detachedTotalSize,
    examples: detachedExamples,
  };

  // ------------------------------------------------------------------
  // Step 11: Closure stats
  // ------------------------------------------------------------------
  const closureNodes = nodes.filter((n) => visited[n.ordinal] && n.type === 'closure');
  const closureTotalSize = closureNodes.reduce((sum, n) => sum + n.selfSize, 0);

  const topClosures = closureNodes
    .sort((a, b) => b.selfSize - a.selfSize)
    .slice(0, 20)
    .map((n) => ({
      name: n.name || '(anonymous)',
      contextSize: n.selfSize,
      retainerPath: getRetainerPath(n.ordinal),
    }));

  const closureStats: ClosureStats = {
    count: closureNodes.length,
    totalSize: closureTotalSize,
    topClosures,
  };

  // ------------------------------------------------------------------
  // Build final result
  // ------------------------------------------------------------------
  return {
    metadata: {
      url: rawSnapshot.url,
      capturedAt: rawSnapshot.capturedAt,
      totalSize,
      nodeCount: v8.snapshot.node_count,
      edgeCount: v8.snapshot.edge_count,
    },
    largestObjects,
    typeStats,
    constructorStats,
    detachedNodes,
    closureStats,
  };
}
