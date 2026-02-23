import { test, expect, describe } from 'bun:test';
import { BROWSER_ORCHESTRATOR_PROMPT } from '../../src/analysis/prompts';
import { MEMORY_HEAP_PROMPT } from '../../src/analysis/prompts/memory-heap';
import { PAGE_LOAD_PROMPT } from '../../src/analysis/prompts/page-load';
import { RUNTIME_BLOCKING_PROMPT } from '../../src/analysis/prompts/runtime-blocking';
import { CODE_PATTERN_PROMPT } from '../../src/analysis/prompts/code-pattern';

describe('orchestrator prompt', () => {
  test('includes dispatch instructions', () => {
    expect(BROWSER_ORCHESTRATOR_PROMPT).toContain('call the `task` tool exactly 4 times');
  });

  test('delegates finding persistence to subagents', () => {
    expect(BROWSER_ORCHESTRATOR_PROMPT).toContain('Do NOT consolidate');
    expect(BROWSER_ORCHESTRATOR_PROMPT).toContain('/findings/*.json');
  });

  test('prevents orchestrator from adding own findings', () => {
    expect(BROWSER_ORCHESTRATOR_PROMPT).toContain('Do NOT add your own findings');
  });

  test('prevents orchestrator from reading files directly', () => {
    expect(BROWSER_ORCHESTRATOR_PROMPT).toContain('Do NOT call read_file');
  });
});

describe('subagent prompts include required shared fragments', () => {
  const prompts = [
    { name: 'memory-heap', prompt: MEMORY_HEAP_PROMPT },
    { name: 'page-load', prompt: PAGE_LOAD_PROMPT },
    { name: 'runtime-blocking', prompt: RUNTIME_BLOCKING_PROMPT },
    { name: 'code-pattern', prompt: CODE_PATTERN_PROMPT },
  ];

  for (const { name, prompt } of prompts) {
    test(`${name} includes VERIFICATION_RULES`, () => {
      expect(prompt).toContain('ALWAYS read the source file');
      expect(prompt).toContain('Copy code verbatim');
    });

    test(`${name} includes PARALLEL_TOOL_CALLS`, () => {
      expect(prompt).toContain('FORBIDDEN actions');
      expect(prompt).toContain('NEVER call ls');
    });

    test(`${name} includes WRITE_FINDINGS_REQUIREMENT`, () => {
      expect(prompt).toContain('Persist your findings to a file');
      expect(prompt).toContain('/findings/');
    });

    test(`${name} includes STRUCTURED_OUTPUT_FIELDS`, () => {
      expect(prompt).toContain('sourceFile');
      expect(prompt).toContain('beforeCode');
      expect(prompt).toContain('afterCode');
    });

    test(`${name} includes SEVERITY_RULES`, () => {
      expect(prompt).toContain('critical');
      expect(prompt).toContain('warning');
      expect(prompt).toContain('info');
    });

    test(`${name} includes OUTPUT_FORMAT`, () => {
      expect(prompt).toContain('Report ALL findings');
    });
  }
});

describe('subagent prompts have domain-specific content', () => {
  test('memory-heap focuses on heap data', () => {
    expect(MEMORY_HEAP_PROMPT).toContain('heap snapshot');
    expect(MEMORY_HEAP_PROMPT).toContain('Detached DOM Nodes');
    expect(MEMORY_HEAP_PROMPT).toContain('Large Retained Objects');
    expect(MEMORY_HEAP_PROMPT).toContain('Closure Leaks');
  });

  test('page-load focuses on render-blocking', () => {
    expect(PAGE_LOAD_PROMPT).toContain('Render-Blocking Scripts');
    expect(PAGE_LOAD_PROMPT).toContain('Sequential Waterfalls');
    expect(PAGE_LOAD_PROMPT).toContain('Large Bundles');
    expect(PAGE_LOAD_PROMPT).toContain('async');
    expect(PAGE_LOAD_PROMPT).toContain('defer');
  });

  test('runtime-blocking focuses on main thread', () => {
    expect(RUNTIME_BLOCKING_PROMPT).toContain('Blocking Functions');
    expect(RUNTIME_BLOCKING_PROMPT).toContain('Layout Thrashing');
    expect(RUNTIME_BLOCKING_PROMPT).toContain('GC Pressure');
    expect(RUNTIME_BLOCKING_PROMPT).toContain('Compound blockers');
    expect(RUNTIME_BLOCKING_PROMPT).toContain('Event Listener Imbalances');
  });

  test('code-pattern focuses on anti-patterns', () => {
    expect(CODE_PATTERN_PROMPT).toContain('Inline Scripts');
    expect(CODE_PATTERN_PROMPT).toContain('DOM Manipulation in Loops');
    expect(CODE_PATTERN_PROMPT).toContain('Missing Event Delegation');
    expect(CODE_PATTERN_PROMPT).toContain('Non-Passive');
    expect(CODE_PATTERN_PROMPT).toContain('Missing Image Dimensions');
  });
});
