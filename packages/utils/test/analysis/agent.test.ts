import { test, expect, describe } from 'bun:test';
import { invokeWithTodoStreaming } from '../../src/analysis/agent';

describe('analysis/agent', () => {
  test('exports invokeWithTodoStreaming function', () => {
    expect(typeof invokeWithTodoStreaming).toBe('function');
  });
});
