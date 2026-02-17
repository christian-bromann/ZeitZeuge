import { test, expect, describe } from 'bun:test';
import { analyze } from '../../src/analysis/agent';

describe('analysis/agent', () => {
  test('exports analyze function', () => {
    expect(typeof analyze).toBe('function');
  });

  test('analyze function accepts model, backend, spinner, and context parameters', () => {
    // Verify the function signature by checking it exists and is a function
    // (actual invocation requires real model + backend)
    expect(analyze.length).toBeGreaterThanOrEqual(3);
  });
});
