import { test, expect, describe } from 'bun:test';
import { analyze } from '../../src/analysis/agent';

describe('analysis/agent', () => {
  test('exports analyze function', async () => {
    expect(typeof analyze).toBe('function');
  });

  test('analyze function accepts model and sandbox parameters', async () => {
    // Verify the function signature by checking it exists and is a function
    // (actual invocation requires real model + VFS sandbox)
    expect(analyze.length).toBeGreaterThanOrEqual(2);
  });
});
