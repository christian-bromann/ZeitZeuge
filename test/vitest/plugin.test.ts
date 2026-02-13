import { test, expect, describe, afterEach } from 'bun:test';
import { existsSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { zeitzeuge } from '../../src/vitest/plugin.js';

// Use a unique temp dir for each test run to avoid conflicts
const TEST_PROFILE_DIR = `.zeitzeuge-test-profiles-${Date.now()}`;

afterEach(() => {
  // Clean up any profile dirs created during tests
  try {
    if (existsSync(resolve(TEST_PROFILE_DIR))) {
      rmSync(resolve(TEST_PROFILE_DIR), { recursive: true, force: true });
    }
  } catch {}
});

/**
 * Create a minimal mock VitestPluginContext.
 */
function createMockContext(configOverrides?: Record<string, any>) {
  return {
    vitest: {
      config: {
        execArgv: [],
        fileParallelism: true,
        reporters: [],
        ...configOverrides,
      },
    },
    project: { name: 'test' },
  };
}

describe('zeitzeuge plugin', () => {
  test('returns a plugin with correct name', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    expect(plugin.name).toBe('vitest:zeitzeuge');
  });

  test('has a configureVitest hook', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    expect(typeof plugin.configureVitest).toBe('function');
  });

  test('injects --cpu-prof into execArgv', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    const argv: string[] = ctx.vitest.config.execArgv;
    expect(argv).toContain('--cpu-prof');
    expect(argv.some((a: string) => a.startsWith('--cpu-prof-dir='))).toBe(true);
  });

  test('does not inject --heap-prof by default', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    const argv: string[] = ctx.vitest.config.execArgv;
    expect(argv).not.toContain('--heap-prof');
    expect(argv.some((a: string) => a.startsWith('--heap-prof-dir='))).toBe(false);
  });

  test('injects --heap-prof when heapProf is enabled', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR, heapProf: true });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    const argv: string[] = ctx.vitest.config.execArgv;
    expect(argv).toContain('--heap-prof');
    expect(argv.some((a: string) => a.startsWith('--heap-prof-dir='))).toBe(true);

    const forksArgv: string[] = ctx.vitest.config.poolOptions.forks.execArgv;
    expect(forksArgv).toContain('--heap-prof');
    expect(forksArgv.some((a: string) => a.startsWith('--heap-prof-dir='))).toBe(true);
  });

  test('also injects into poolOptions.forks.execArgv', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    const forksArgv: string[] = ctx.vitest.config.poolOptions.forks.execArgv;
    expect(forksArgv).toContain('--cpu-prof');
    expect(forksArgv.some((a: string) => a.startsWith('--cpu-prof-dir='))).toBe(true);
  });

  test('forces pool to forks', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    expect(ctx.vitest.config.pool).toBe('forks');
  });

  test('creates the profile directory', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    expect(existsSync(resolve(TEST_PROFILE_DIR))).toBe(true);
  });

  test('disables file parallelism', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    expect(ctx.vitest.config.fileParallelism).toBe(false);
  });

  test('pushes a reporter into config.reporters', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    expect(ctx.vitest.config.reporters.length).toBe(1);
    expect(ctx.vitest.config.reporters[0].constructor.name).toBe('ZeitZeugeReporter');
  });

  test('respects enabled: false (no-op)', () => {
    const plugin = zeitzeuge({ enabled: false, profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    // Nothing should be modified
    expect(ctx.vitest.config.execArgv).toEqual([]);
    expect(ctx.vitest.config.fileParallelism).toBe(true);
    expect(ctx.vitest.config.reporters).toEqual([]);
  });

  test('uses custom profileDir', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    const cpuProfDir = ctx.vitest.config.execArgv.find((a: string) =>
      a.startsWith('--cpu-prof-dir='),
    );
    expect(cpuProfDir).toBeDefined();
    expect(cpuProfDir).toContain(TEST_PROFILE_DIR);
  });

  test('preserves existing execArgv entries', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext({ execArgv: ['--max-old-space-size=4096'] });

    plugin.configureVitest(ctx);

    expect(ctx.vitest.config.execArgv).toContain('--max-old-space-size=4096');
    expect(ctx.vitest.config.execArgv).toContain('--cpu-prof');
  });

  test('uses default options when none specified', () => {
    const plugin = zeitzeuge({ profileDir: TEST_PROFILE_DIR });
    const ctx = createMockContext();

    plugin.configureVitest(ctx);

    // Verify defaults applied — reporter should have the default output path
    expect(ctx.vitest.config.reporters.length).toBe(1);
  });
});
