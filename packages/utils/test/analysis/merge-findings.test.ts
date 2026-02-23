import { test, expect, describe, mock } from 'bun:test';

import { mergeFindings } from '../../src/analysis/merge-findings';
import type { Finding } from '../../src/types';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'warning',
    title: 'Test finding',
    description: 'A test finding',
    category: 'hot-function',
    suggestedFix: 'Fix it',
    ...overrides,
  };
}

function createMockBackend(files: Record<string, object>) {
  const written: Record<string, string> = {};
  return {
    backend: {
      lsInfo: mock(async (dir: string) => {
        if (dir !== '/findings') throw new Error('ENOENT');
        return Object.keys(files).map((name) => ({
          path: `/findings/${name}`,
          is_dir: false,
        }));
      }),
      readRaw: mock(async (path: string) => {
        const name = path.replace('/findings/', '');
        const data = files[name];
        if (!data) throw new Error(`ENOENT: ${path}`);
        return { content: [JSON.stringify(data)] };
      }),
      write: mock(async (path: string, content: string) => {
        written[path] = content;
        return { error: null };
      }),
    } as any,
    written,
  };
}

describe('mergeFindings', () => {
  test('merges findings from multiple subagent files', async () => {
    const f1 = makeFinding({ title: 'Memory leak', category: 'memory-leak' });
    const f2 = makeFinding({ title: 'Blocking IO', category: 'blocking-io' });
    const f3 = makeFinding({ title: 'Large asset', category: 'large-asset' });

    const { backend, written } = createMockBackend({
      'memory-heap.json': { findings: [f1] },
      'runtime-blocking.json': { findings: [f2, f3] },
    });

    const result = await mergeFindings(backend);

    expect(result).toHaveLength(3);
    expect(result[0]!.title).toBe('Memory leak');
    expect(result[1]!.title).toBe('Blocking IO');
    expect(result[2]!.title).toBe('Large asset');

    const merged = JSON.parse(written['/findings/merged.json']!);
    expect(merged.findings).toHaveLength(3);
  });

  test('skips merged.json during listing', async () => {
    const f1 = makeFinding({ title: 'Issue 1' });

    const { backend } = createMockBackend({
      'page-load.json': { findings: [f1] },
      'merged.json': { findings: [f1, f1] },
    });

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Issue 1');
  });

  test('handles malformed JSON gracefully', async () => {
    const f1 = makeFinding({ title: 'Good finding' });

    const { backend } = createMockBackend({
      'good.json': { findings: [f1] },
    });

    // Override readRaw to return bad JSON for one file
    const originalLsInfo = backend.lsInfo;
    backend.lsInfo = mock(async (dir: string) => {
      const files = await originalLsInfo(dir);
      return [...files, { path: '/findings/bad.json', is_dir: false }];
    });

    const originalReadRaw = backend.readRaw;
    backend.readRaw = mock(async (path: string) => {
      if (path === '/findings/bad.json') {
        return { content: ['not valid json {{{'] };
      }
      return originalReadRaw(path);
    });

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Good finding');
  });

  test('handles empty findings directory', async () => {
    const { backend } = createMockBackend({});

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(0);
  });

  test('handles non-existent findings directory', async () => {
    const backend = {
      lsInfo: mock(async () => {
        throw new Error('ENOENT');
      }),
      readRaw: mock(async () => ({ content: [] })),
      write: mock(async () => ({ error: null })),
    } as any;

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(0);
  });

  test('handles files with empty findings arrays', async () => {
    const f1 = makeFinding({ title: 'Only finding' });

    const { backend, written } = createMockBackend({
      'memory-heap.json': { findings: [] },
      'page-load.json': { findings: [f1] },
      'code-pattern.json': { findings: [] },
    });

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Only finding');

    const merged = JSON.parse(written['/findings/merged.json']!);
    expect(merged.findings).toHaveLength(1);
  });

  test('skips files that fail schema validation', async () => {
    const f1 = makeFinding({ title: 'Valid' });

    const { backend } = createMockBackend({
      'valid.json': { findings: [f1] },
    });

    const originalLsInfo = backend.lsInfo;
    backend.lsInfo = mock(async (dir: string) => {
      const files = await originalLsInfo(dir);
      return [...files, { path: '/findings/invalid.json', is_dir: false }];
    });

    const originalReadRaw = backend.readRaw;
    backend.readRaw = mock(async (path: string) => {
      if (path === '/findings/invalid.json') {
        return { content: [JSON.stringify({ findings: [{ wrong: 'shape' }] })] };
      }
      return originalReadRaw(path);
    });

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Valid');
  });

  test('handles relative paths with dir prefix from lsInfo', async () => {
    const f1 = makeFinding({ title: 'Found it' });

    const backend = {
      lsInfo: mock(async () => [{ path: 'findings/runtime-blocking.json', is_dir: false }]),
      readRaw: mock(async (path: string) => {
        expect(path).toBe('/findings/runtime-blocking.json');
        return { content: [JSON.stringify({ findings: [f1] })] };
      }),
      write: mock(async () => ({ error: null })),
    } as any;

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Found it');
  });

  test('handles bare filename paths from lsInfo', async () => {
    const f1 = makeFinding({ title: 'Bare name' });

    const backend = {
      lsInfo: mock(async () => [{ path: 'page-load.json', is_dir: false }]),
      readRaw: mock(async (path: string) => {
        expect(path).toBe('/findings/page-load.json');
        return { content: [JSON.stringify({ findings: [f1] })] };
      }),
      write: mock(async () => ({ error: null })),
    } as any;

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(1);
    expect(result[0]!.title).toBe('Bare name');
  });

  test('skips non-json files', async () => {
    const { backend } = createMockBackend({});

    backend.lsInfo = mock(async () => [
      { path: '/findings/readme.txt', is_dir: false },
      { path: '/findings/.gitkeep', is_dir: false },
    ]);

    const result = await mergeFindings(backend);
    expect(result).toHaveLength(0);
  });
});
