import { test, expect, describe } from 'bun:test';

describe('analysis/agent', () => {
  test('exports analyze function', async () => {
    const mod = await import('../../src/analysis/agent');
    expect(typeof mod.analyze).toBe('function');
  });

  test('exports formatBytes function for backwards compatibility', async () => {
    const mod = await import('../../src/analysis/agent');
    expect(typeof mod.formatBytes).toBe('function');
    expect(mod.formatBytes(1024)).toBe('1.0 KB');
  });

  test('analyze function accepts model and sandbox parameters', async () => {
    const mod = await import('../../src/analysis/agent');
    // Verify the function signature by checking it exists and is a function
    // (actual invocation requires real model + VFS sandbox)
    expect(mod.analyze.length).toBeGreaterThanOrEqual(2);
  });
});

describe('analysis/prompts', () => {
  test('exports SYSTEM_PROMPT', async () => {
    const mod = await import('../../src/analysis/prompts');
    expect(typeof mod.SYSTEM_PROMPT).toBe('string');
  });

  test('SYSTEM_PROMPT mentions workspace structure', async () => {
    const { SYSTEM_PROMPT } = await import('../../src/analysis/prompts');
    expect(SYSTEM_PROMPT).toContain('/heap/summary.json');
    expect(SYSTEM_PROMPT).toContain('/trace/summary.json');
    expect(SYSTEM_PROMPT).toContain('/scripts/');
    expect(SYSTEM_PROMPT).toContain('/styles/');
    expect(SYSTEM_PROMPT).toContain('/html/');
  });

  test('SYSTEM_PROMPT covers memory, page-load, and runtime issues', async () => {
    const { SYSTEM_PROMPT } = await import('../../src/analysis/prompts');
    // Memory issues
    expect(SYSTEM_PROMPT).toContain('Memory leak');
    expect(SYSTEM_PROMPT).toContain('Detached DOM');
    expect(SYSTEM_PROMPT).toContain('Closure leak');
    // Page-load issues
    expect(SYSTEM_PROMPT).toContain('Render-blocking');
    expect(SYSTEM_PROMPT).toContain('Long task');
    expect(SYSTEM_PROMPT).toContain('Large bundle');
    // Runtime issues (new in Spec 003)
    expect(SYSTEM_PROMPT).toContain('Frame-blocking functions');
    expect(SYSTEM_PROMPT).toContain('Event listener leaks');
    expect(SYSTEM_PROMPT).toContain('GC pressure');
    expect(SYSTEM_PROMPT).toContain('Layout thrashing');
  });

  test('SYSTEM_PROMPT references runtime trace workspace files', async () => {
    const { SYSTEM_PROMPT } = await import('../../src/analysis/prompts');
    expect(SYSTEM_PROMPT).toContain('/trace/runtime/summary.json');
    expect(SYSTEM_PROMPT).toContain('/trace/runtime/blocking-functions.json');
    expect(SYSTEM_PROMPT).toContain('/trace/runtime/event-listeners.json');
    expect(SYSTEM_PROMPT).toContain('/trace/runtime/frame-breakdown.json');
  });
});
