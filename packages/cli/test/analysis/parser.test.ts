import { test, expect, describe } from 'bun:test';
import { parseSnapshot } from '../../src/analysis/parser';
import type { RawSnapshot } from '@zeitzeuge/utils';

/**
 * Builds a minimal valid V8 heap snapshot JSON string.
 *
 * The snapshot has 7 node fields and 3 edge fields (the standard V8 layout).
 *
 * Node fields: type, name, id, self_size, edge_count, trace_node_id, detachedness
 * Edge fields: type, name_or_index, to_node
 *
 * Node types: hidden(0), array(1), string(2), object(3), code(4), closure(5),
 *             regexp(6), number(7), native(8), synthetic(9),
 *             concatenated string(10), sliced string(11), symbol(12), bigint(13)
 *
 * Edge types: context(0), element(1), property(2), internal(3), hidden(4),
 *             shortcut(5), weak(6)
 */
function buildSnapshot(opts: {
  nodes: number[];
  edges: number[];
  strings: string[];
  nodeCount: number;
  edgeCount: number;
}): string {
  return JSON.stringify({
    snapshot: {
      meta: {
        node_fields: [
          'type',
          'name',
          'id',
          'self_size',
          'edge_count',
          'trace_node_id',
          'detachedness',
        ],
        node_types: [
          [
            'hidden',
            'array',
            'string',
            'object',
            'code',
            'closure',
            'regexp',
            'number',
            'native',
            'synthetic',
            'concatenated string',
            'sliced string',
            'symbol',
            'bigint',
          ],
          'string',
          'number',
          'number',
          'number',
          'number',
          'number',
        ],
        edge_fields: ['type', 'name_or_index', 'to_node'],
        edge_types: [
          ['context', 'element', 'property', 'internal', 'hidden', 'shortcut', 'weak'],
          'string_or_number',
          'node',
        ],
      },
      node_count: opts.nodeCount,
      edge_count: opts.edgeCount,
    },
    nodes: opts.nodes,
    edges: opts.edges,
    strings: opts.strings,
  });
}

function makeRawSnapshot(data: string): RawSnapshot {
  return {
    data,
    capturedAt: 1700000000000,
    url: 'https://example.com',
  };
}

// ── Fixtures ───────────────────────────────────────────────────────────
// node_fields.length = 7, so each node = 7 values
// edge_fields.length = 3, so each edge = 3 values

/**
 * Graph layout for the "standard" fixture:
 *
 * Node 0 (root):      hidden, name=""(idx 0), id=1, selfSize=0,  edgeCount=3
 * Node 1 (object):    object, name="Array"(idx 1), id=2, selfSize=1024, edgeCount=1
 * Node 2 (string):    string, name="hello"(idx 2), id=3, selfSize=256,  edgeCount=0
 * Node 3 (closure):   closure, name="onClick"(idx 3), id=4, selfSize=512, edgeCount=0
 * Node 4 (native):    native, name="Detached HTMLDivElement"(idx 4), id=5, selfSize=128, edgeCount=0
 *
 * Edges from root (node 0):
 *   property -> node 1 (to_node = 1*7 = 7)
 *   property -> node 3 (to_node = 3*7 = 21)
 *   property -> node 4 (to_node = 4*7 = 28)
 *
 * Edges from node 1:
 *   element -> node 2 (to_node = 2*7 = 14)
 */
const STD_STRINGS = [
  '',
  'Array',
  'hello',
  'onClick',
  'Detached HTMLDivElement',
  'items',
  'callback',
  'dom',
];

// prettier-ignore
const STD_NODES = [
  // type, name, id, self_size, edge_count, trace_node_id, detachedness
  /* node 0 (root) */    0, 0, 1, 0, 3, 0, 0,
  /* node 1 (object) */  3, 1, 2, 1024, 1, 0, 0,
  /* node 2 (string) */  2, 2, 3, 256, 0, 0, 0,
  /* node 3 (closure) */ 5, 3, 4, 512, 0, 0, 0,
  /* node 4 (native) */  8, 4, 5, 128, 0, 0, 1,  // detachedness = 1
];

// prettier-ignore
const STD_EDGES = [
  // type, name_or_index, to_node
  /* root → node1 */ 2, 5, 7,   // property "items" → node 1 (7 = 1*7)
  /* root → node3 */ 2, 6, 21,  // property "callback" → node 3 (21 = 3*7)
  /* root → node4 */ 2, 7, 28,  // property "dom" → node 4 (28 = 4*7)
  /* node1 → node2 */ 1, 0, 14, // element [0] → node 2 (14 = 2*7)
];

const STANDARD_SNAPSHOT = buildSnapshot({
  nodes: STD_NODES,
  edges: STD_EDGES,
  strings: STD_STRINGS,
  nodeCount: 5,
  edgeCount: 4,
});

// ── Tests ──────────────────────────────────────────────────────────────

describe('parseSnapshot', () => {
  describe('metadata', () => {
    test('returns correct nodeCount, edgeCount, and totalSize', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      expect(result.metadata.nodeCount).toBe(5);
      expect(result.metadata.edgeCount).toBe(4);
      // totalSize = 0 + 1024 + 256 + 512 + 128 = 1920
      expect(result.metadata.totalSize).toBe(1920);
      expect(result.metadata.url).toBe('https://example.com');
      expect(result.metadata.capturedAt).toBe(1700000000000);
    });
  });

  describe('largestObjects', () => {
    test('is an array sorted by retainedSize descending', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      expect(result.largestObjects).toBeInstanceOf(Array);
      expect(result.largestObjects.length).toBeGreaterThan(0);

      for (let i = 1; i < result.largestObjects.length; i++) {
        expect(result.largestObjects[i]!.retainedSize).toBeLessThanOrEqual(
          result.largestObjects[i - 1]!.retainedSize,
        );
      }
    });

    test('includes expected objects from the fixture', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));
      const names = result.largestObjects.map((o) => o.name);

      // "Array" is an object node; its retained size includes the string child
      expect(names).toContain('Array');
    });

    test('each object has required fields', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      for (const obj of result.largestObjects) {
        expect(typeof obj.name).toBe('string');
        expect(typeof obj.type).toBe('string');
        expect(typeof obj.selfSize).toBe('number');
        expect(typeof obj.retainedSize).toBe('number');
        expect(Array.isArray(obj.retainerPath)).toBe(true);
      }
    });
  });

  describe('typeStats', () => {
    test('includes expected node types from fixture', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));
      const types = result.typeStats.map((t) => t.type);

      // Our fixture has hidden (root), object, string, closure, native
      expect(types).toContain('hidden');
      expect(types).toContain('object');
      expect(types).toContain('string');
      expect(types).toContain('closure');
      expect(types).toContain('native');
    });

    test('each type stat has correct structure', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      for (const stat of result.typeStats) {
        expect(typeof stat.type).toBe('string');
        expect(typeof stat.count).toBe('number');
        expect(typeof stat.totalSize).toBe('number');
        expect(typeof stat.avgSize).toBe('number');
        expect(stat.count).toBeGreaterThan(0);
      }
    });

    test('type stats are sorted by totalSize descending', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      for (let i = 1; i < result.typeStats.length; i++) {
        expect(result.typeStats[i]!.totalSize).toBeLessThanOrEqual(
          result.typeStats[i - 1]!.totalSize,
        );
      }
    });
  });

  describe('constructorStats', () => {
    test('includes Array constructor from fixture', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));
      const ctors = result.constructorStats.map((c) => c.constructor);
      expect(ctors).toContain('Array');
    });

    test('Array constructor has correct count and totalSize', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));
      const arrayStat = result.constructorStats.find((c) => c.constructor === 'Array');
      expect(arrayStat).toBeDefined();
      expect(arrayStat!.count).toBe(1);
      expect(arrayStat!.totalSize).toBe(1024);
    });
  });

  describe('detachedNodes', () => {
    test('detects the Detached HTMLDivElement from fixture', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      expect(result.detachedNodes.count).toBeGreaterThan(0);
      expect(result.detachedNodes.totalSize).toBeGreaterThan(0);
      expect(result.detachedNodes.examples.length).toBeGreaterThan(0);
      expect(result.detachedNodes.examples[0]!.name).toContain('Detached');
    });
  });

  describe('closureStats', () => {
    test('detects closures from fixture', () => {
      const result = parseSnapshot(makeRawSnapshot(STANDARD_SNAPSHOT));

      expect(result.closureStats.count).toBe(1);
      expect(result.closureStats.totalSize).toBe(512);
      expect(result.closureStats.topClosures.length).toBe(1);
      expect(result.closureStats.topClosures[0]!.name).toBe('onClick');
    });
  });

  describe('edge cases', () => {
    test('handles a single-node (root-only) snapshot without crashing', () => {
      // prettier-ignore
      const minimalNodes = [
        // root node only: hidden, name="", id=1, selfSize=0, edgeCount=0, trace=0, detachedness=0
        0, 0, 1, 0, 0, 0, 0,
      ];

      const data = buildSnapshot({
        nodes: minimalNodes,
        edges: [],
        strings: [''],
        nodeCount: 1,
        edgeCount: 0,
      });

      const result = parseSnapshot(makeRawSnapshot(data));

      expect(result.metadata.nodeCount).toBe(1);
      expect(result.metadata.edgeCount).toBe(0);
      expect(result.metadata.totalSize).toBe(0);
      expect(result.largestObjects).toEqual([]);
      expect(result.typeStats.length).toBeGreaterThan(0);
      expect(result.constructorStats).toEqual([]);
      expect(result.detachedNodes.count).toBe(0);
      expect(result.closureStats.count).toBe(0);
    });

    test('handles snapshot with only unreachable non-root nodes gracefully', () => {
      // Two nodes, but root has no edges → node 1 is unreachable
      // prettier-ignore
      const nodesArr = [
        /* root */  0, 0, 1, 0, 0, 0, 0,
        /* obj  */  3, 1, 2, 500, 0, 0, 0,
      ];

      const data = buildSnapshot({
        nodes: nodesArr,
        edges: [],
        strings: ['', 'Orphan'],
        nodeCount: 2,
        edgeCount: 0,
      });

      const result = parseSnapshot(makeRawSnapshot(data));

      expect(result.metadata.nodeCount).toBe(2);
      // totalSize counts all nodes regardless of reachability
      expect(result.metadata.totalSize).toBe(500);
      // But largestObjects only includes reachable non-root nodes (via BFS)
      // The orphan is not reachable, so it should be excluded from largestObjects
      expect(result.largestObjects.length).toBe(0);
    });

    test('weak edges do not contribute to retained size', () => {
      // root → node1 via property, root → node2 via weak
      // node2 should still be reachable? No – weak edges are skipped in adjacency.
      // So node2 is unreachable and excluded.
      // prettier-ignore
      const nodesArr = [
        /* root  */ 0, 0, 1, 0, 2, 0, 0,
        /* node1 */ 3, 1, 2, 100, 0, 0, 0,
        /* node2 */ 3, 2, 3, 200, 0, 0, 0,
      ];

      // prettier-ignore
      const edgesArr = [
        /* root → node1 */ 2, 1, 7,   // property
        /* root → node2 */ 6, 2, 14,  // weak (type index 6)
      ];

      const data = buildSnapshot({
        nodes: nodesArr,
        edges: edgesArr,
        strings: ['', 'Obj1', 'Obj2'],
        nodeCount: 3,
        edgeCount: 2,
      });

      const result = parseSnapshot(makeRawSnapshot(data));

      // Only node1 is reachable via non-weak edges
      const names = result.largestObjects.map((o) => o.name);
      expect(names).toContain('Obj1');
      expect(names).not.toContain('Obj2');
    });
  });
});
