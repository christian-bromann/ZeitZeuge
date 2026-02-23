import { test, expect, describe } from 'bun:test';
import { classifyScript } from '../src/classify.js';

const PROJECT_ROOT = '/home/user/my-project';

describe('classifyScript (bun-test)', () => {
  test('classifies application source files', () => {
    expect(classifyScript('/home/user/my-project/src/utils.ts', PROJECT_ROOT)).toBe('application');
  });

  test('classifies test files by pattern', () => {
    expect(classifyScript('/home/user/my-project/tests/utils.test.ts', PROJECT_ROOT)).toBe('test');
  });

  test('classifies node_modules as dependency', () => {
    expect(classifyScript('/home/user/my-project/node_modules/lodash/index.js', PROJECT_ROOT)).toBe(
      'dependency',
    );
  });

  test('classifies bun: builtins as framework', () => {
    expect(classifyScript('bun:test', PROJECT_ROOT)).toBe('framework');
    expect(classifyScript('bun:jsc', PROJECT_ROOT)).toBe('framework');
    expect(classifyScript('bun:internal', PROJECT_ROOT)).toBe('framework');
  });

  test('classifies node: builtins as framework', () => {
    expect(classifyScript('node:internal/test_runner/runner', PROJECT_ROOT)).toBe('framework');
    expect(classifyScript('node:test', PROJECT_ROOT)).toBe('framework');
  });

  test('classifies empty URL as unknown', () => {
    expect(classifyScript('', PROJECT_ROOT)).toBe('unknown');
  });
});
