import { test, expect, describe } from 'bun:test';
import { analyze, formatBytes } from '../../src/analysis/agent';

describe('analysis/agent', () => {
  test('exports analyze function', async () => {
    expect(typeof analyze).toBe('function');
  });

  test('exports formatBytes function for backwards compatibility', async () => {
    expect(typeof formatBytes).toBe('function');
    expect(formatBytes(1024)).toBe('1.0 KB');
  });

  test('analyze function accepts model and sandbox parameters', async () => {
    // Verify the function signature by checking it exists and is a function
    // (actual invocation requires real model + VFS sandbox)
    expect(analyze.length).toBeGreaterThanOrEqual(2);
  });
});
