export interface LineSegment {
  text: string;
  className: string;
}

export interface LineDefinition {
  text: string;
  delay: number;
  className?: string;
  segments?: LineSegment[];
}

export const COMMAND = 'vitest run';

export const TERMINAL_LINES: LineDefinition[] = [
  // ── Phase 2 — Vitest Header + Test Results ──
  {
    text: ' RUN  v3.2.4 /home/alex/project',
    delay: 300,
    segments: [
      { text: ' ', className: 'term-text' },
      { text: 'RUN', className: 'term-badge' },
      { text: '  v3.2.4 ', className: 'term-muted' },
      { text: '/home/alex/project', className: 'term-path' },
    ],
  },
  { text: '', delay: 100 },
  {
    text: ' ✓ tests/notification-service.test.ts (12 tests) 13ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/notification-service.test.ts', className: 'term-text' },
      { text: ' (12 tests) 13ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/task-service.test.ts (29 tests) 5ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/task-service.test.ts', className: 'term-text' },
      { text: ' (29 tests) 5ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/analytics-service.test.ts (10 tests) 5ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/analytics-service.test.ts', className: 'term-text' },
      { text: ' (10 tests) 5ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/crypto.test.ts (12 tests) 5ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/crypto.test.ts', className: 'term-text' },
      { text: ' (12 tests) 5ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/validators.test.ts (26 tests) 4ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/validators.test.ts', className: 'term-text' },
      { text: ' (26 tests) 4ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/request-tracker.test.ts (9 tests) 3ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/request-tracker.test.ts', className: 'term-text' },
      { text: ' (9 tests) 3ms', className: 'term-muted' },
    ],
  },
  {
    text: ' ✓ tests/cache-service.test.ts (11 tests) 4ms',
    delay: 200,
    segments: [
      { text: ' ✓', className: 'term-success' },
      { text: ' tests/cache-service.test.ts', className: 'term-text' },
      { text: ' (11 tests) 4ms', className: 'term-muted' },
    ],
  },

  // ── Phase 3 — Performance Metrics ──
  {
    text: 'zeitzeuge: Performance Metrics',
    delay: 400,
    segments: [
      { text: 'zeitzeuge:', className: 'term-cyan' },
      { text: ' Performance Metrics', className: 'term-heading' },
    ],
  },
  { text: '', delay: 0 },
  { text: '  Suite', delay: 0 },
  {
    text: '    Total: 38ms · 109 tests (109 pass, 0 fail) · Setup: 0µs',
    delay: 0,
    segments: [
      { text: '    Total: ', className: 'term-text' },
      { text: '38ms', className: 'term-value' },
      { text: ' · ', className: 'term-muted' },
      { text: '109 tests', className: 'term-value' },
      { text: ' (109 pass, 0 fail) · Setup: ', className: 'term-muted' },
      { text: '0µs', className: 'term-value' },
    ],
  },
  {
    text: '    Avg: 350µs · Median: 130µs · P95: 1ms · Slowest: 10ms',
    delay: 0,
    segments: [
      { text: '    Avg: ', className: 'term-text' },
      { text: '350µs', className: 'term-value' },
      { text: ' · Median: ', className: 'term-muted' },
      { text: '130µs', className: 'term-value' },
      { text: ' · P95: ', className: 'term-muted' },
      { text: '1ms', className: 'term-value' },
      { text: ' · Slowest: ', className: 'term-muted' },
      { text: '10ms', className: 'term-value' },
    ],
  },
  {
    text: '    Slowest file: tests/notification-service.test.ts (13ms)',
    delay: 0,
    segments: [
      { text: '    Slowest file: ', className: 'term-text' },
      { text: 'tests/notification-service.test.ts', className: 'term-text' },
      { text: ' (13ms)', className: 'term-muted' },
    ],
  },
  { text: '', delay: 0 },
  {
    text: '  CPU Breakdown',
    delay: 0,
    segments: [{ text: '  CPU Breakdown', className: 'term-heading' }],
  },
  {
    text: '    Application: 19ms (2.26%) · Dependencies: 170ms (20.58%) · Test/Framework: 412ms (49.82%)',
    delay: 0,
    segments: [
      { text: '    Application: ', className: 'term-text' },
      { text: '19ms', className: 'term-value' },
      { text: ' (2.26%)', className: 'term-muted' },
      { text: ' · Dependencies: ', className: 'term-text' },
      { text: '170ms', className: 'term-value' },
      { text: ' (20.58%)', className: 'term-muted' },
      { text: ' · Test/Framework: ', className: 'term-text' },
      { text: '412ms', className: 'term-value' },
      { text: ' (49.82%)', className: 'term-muted' },
    ],
  },
  {
    text: '    GC: 22ms (2.65%) · Idle: 96ms (11.6%)',
    delay: 0,
    segments: [
      { text: '    GC: ', className: 'term-text' },
      { text: '22ms', className: 'term-value' },
      { text: ' (2.65%)', className: 'term-muted' },
      { text: ' · Idle: ', className: 'term-text' },
      { text: '96ms', className: 'term-value' },
      { text: ' (11.6%)', className: 'term-muted' },
    ],
  },
  { text: '', delay: 0 },
  {
    text: '  Top Hot Functions',
    delay: 0,
    segments: [{ text: '  Top Hot Functions', className: 'term-heading' }],
  },
  {
    text: '    90ms (10.91%) spawnSync [framework]',
    delay: 0,
    segments: [
      { text: '    ', className: 'term-text' },
      { text: '90ms', className: 'term-value' },
      { text: ' (10.91%) ', className: 'term-muted' },
      { text: 'spawnSync', className: 'term-text' },
      { text: ' [framework]', className: 'term-muted' },
    ],
  },
  {
    text: '      node:internal/child_process:1107',
    delay: 0,
    segments: [{ text: '      node:internal/child_process:1107', className: 'term-path' }],
  },
  {
    text: '    80ms (9.71%) setProcessTitle [dependency]',
    delay: 0,
    segments: [
      { text: '    ', className: 'term-text' },
      { text: '80ms', className: 'term-value' },
      { text: ' (9.71%) ', className: 'term-muted' },
      { text: 'setProcessTitle', className: 'term-text' },
      { text: ' [dependency]', className: 'term-muted' },
    ],
  },
  {
    text: '      file:///home/alex/project/node_modules/.bun/vitest@3.2.4/node_modules/vitest/dist/chunks/utils.XdZDrNZV.js:28',
    delay: 0,
    segments: [
      {
        text: '      file:///home/alex/project/node_modules/.bun/vitest@3.2.4/node_modules/vitest/dist/chunks/utils.XdZDrNZV.js:28',
        className: 'term-path',
      },
    ],
  },
  {
    text: '    68ms (8.2%) compileSourceTextModule [framework]',
    delay: 0,
    segments: [
      { text: '    ', className: 'term-text' },
      { text: '68ms', className: 'term-value' },
      { text: ' (8.2%) ', className: 'term-muted' },
      { text: 'compileSourceTextModule', className: 'term-text' },
      { text: ' [framework]', className: 'term-muted' },
    ],
  },
  {
    text: '      node:internal/modules/esm/utils:343',
    delay: 0,
    segments: [{ text: '      node:internal/modules/esm/utils:343', className: 'term-path' }],
  },
  {
    text: '    22ms (2.65%) (garbage collector)',
    delay: 0,
    segments: [
      { text: '    ', className: 'term-text' },
      { text: '22ms', className: 'term-value' },
      { text: ' (2.65%) ', className: 'term-muted' },
      { text: '(garbage collector)', className: 'term-text' },
    ],
  },
  {
    text: '    19ms (2.32%) internalModuleStat',
    delay: 0,
    segments: [
      { text: '    ', className: 'term-text' },
      { text: '19ms', className: 'term-value' },
      { text: ' (2.32%) ', className: 'term-muted' },
      { text: 'internalModuleStat', className: 'term-text' },
    ],
  },
  { text: '', delay: 0 },
  {
    text: '  Event Listener Tracking',
    delay: 0,
    segments: [{ text: '  Event Listener Tracking', className: 'term-heading' }],
  },
  {
    text: '    ⚠ EventEmitter.task:changed: 11 listeners (max: 10)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      { text: ' EventEmitter.task:changed: 11 listeners (max: 10)', className: 'term-text' },
    ],
  },
  {
    text: '      at getAnalytics (/home/alex/project/src/services/analytics-service.ts:27:13)',
    delay: 0,
    segments: [
      {
        text: '      at getAnalytics (/home/alex/project/src/services/analytics-service.ts:27:13)',
        className: 'term-path',
      },
    ],
  },
  {
    text: '      at /home/alex/project/tests/analytics-service.test.ts:137:5',
    delay: 0,
    segments: [
      {
        text: '      at /home/alex/project/tests/analytics-service.test.ts:137:5',
        className: 'term-path',
      },
    ],
  },
  {
    text: '    ⚠ EventEmitter "task:changed": 15 adds, 0 removes (15 not cleaned up)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      {
        text: ' EventEmitter "task:changed": 15 adds, 0 removes (15 not cleaned up)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    ⚠ EventEmitter "message": 14 adds, 0 removes (14 not cleaned up)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      {
        text: ' EventEmitter "message": 14 adds, 0 removes (14 not cleaned up)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    ⚠ EventEmitter "end": 7 adds, 0 removes (7 not cleaned up)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      { text: ' EventEmitter "end": 7 adds, 0 removes (7 not cleaned up)', className: 'term-text' },
    ],
  },
  {
    text: '    ⚠ EventEmitter "SIGTERM": 7 adds, 0 removes (7 not cleaned up)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      {
        text: ' EventEmitter "SIGTERM": 7 adds, 0 removes (7 not cleaned up)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    ⚠ EventEmitter "uncaughtException": 7 adds, 0 removes (7 not cleaned up)',
    delay: 0,
    segments: [
      { text: '    ⚠', className: 'term-warning' },
      {
        text: ' EventEmitter "uncaughtException": 7 adds, 0 removes (7 not cleaned up)',
        className: 'term-text',
      },
    ],
  },

  // ── Phase 4 — Test Summary ──
  { text: '', delay: 500 },
  {
    text: ' Test Files  7 passed (7)',
    delay: 150,
    segments: [
      { text: ' Test Files  ', className: 'term-muted' },
      { text: '7 passed', className: 'term-success' },
      { text: ' (7)', className: 'term-muted' },
    ],
  },
  {
    text: '      Tests  109 passed (109)',
    delay: 150,
    segments: [
      { text: '      Tests  ', className: 'term-muted' },
      { text: '109 passed', className: 'term-success' },
      { text: ' (109)', className: 'term-muted' },
    ],
  },
  {
    text: '   Start at  17:43:49',
    delay: 150,
    segments: [
      { text: '   Start at  ', className: 'term-muted' },
      { text: '17:43:49', className: 'term-text' },
    ],
  },
  {
    text: '   Duration  1.06s (transform 59ms, setup 0ms, collect 95ms, tests 38ms, environment 1ms, prepare 213ms)',
    delay: 150,
    segments: [
      { text: '   Duration  ', className: 'term-muted' },
      { text: '1.06s', className: 'term-text' },
      {
        text: ' (transform 59ms, setup 0ms, collect 95ms, tests 38ms, environment 1ms, prepare 213ms)',
        className: 'term-muted',
      },
    ],
  },

  // ── Phase 5 — Agent Analysis ──
  { text: '', delay: 800 },
  {
    text: '- zeitzeuge: Analyzing test performance...',
    delay: 300,
    segments: [
      { text: '- ', className: 'term-text' },
      { text: 'zeitzeuge:', className: 'term-cyan' },
      { text: ' Analyzing test performance...', className: 'term-text' },
    ],
  },
  {
    text: '  Performance analysis progress:',
    delay: 300,
    segments: [{ text: '  Performance analysis progress:', className: 'term-text' }],
  },
  {
    text: '    ↳ task(subagent_type: "cpu-hotspot", description: "Find blocking/event-loop-blocking ope...")',
    delay: 300,
    segments: [
      { text: '    ↳ ', className: 'term-muted' },
      { text: 'task(', className: 'term-cyan' },
      { text: 'subagent_type: ', className: 'term-text' },
      { text: '"cpu-hotspot"', className: 'term-agent' },
      {
        text: ', description: "Find blocking/event-loop-blocking ope...")',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    ↳ task(subagent_type: "listener-leak", description: "Find event listener leaks, add/remove...")',
    delay: 300,
    segments: [
      { text: '    ↳ ', className: 'term-muted' },
      { text: 'task(', className: 'term-cyan' },
      { text: 'subagent_type: ', className: 'term-text' },
      { text: '"listener-leak"', className: 'term-agent' },
      {
        text: ', description: "Find event listener leaks, add/remove...")',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    ↳ task(subagent_type: "memory-closure", description: "Find closure-based memory leaks, unbo...")',
    delay: 300,
    segments: [
      { text: '    ↳ ', className: 'term-muted' },
      { text: 'task(', className: 'term-cyan' },
      { text: 'subagent_type: ', className: 'term-text' },
      { text: '"memory-closure"', className: 'term-agent' },
      {
        text: ', description: "Find closure-based memory leaks, unbo...")',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    ↳ task(subagent_type: "code-pattern", description: "Find O(n²) algorithms, unnecessary JS...")',
    delay: 300,
    segments: [
      { text: '    ↳ ', className: 'term-muted' },
      { text: 'task(', className: 'term-cyan' },
      { text: 'subagent_type: ', className: 'term-text' },
      { text: '"code-pattern"', className: 'term-agent' },
      {
        text: ', description: "Find O(n²) algorithms, unnecessary JS...")',
        className: 'term-muted',
      },
    ],
  },

  // Agent progress lines
  {
    text: '        ↳ [cpu-hotspot] read_file(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
    delay: 1000,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      {
        text: '(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '        ↳ [code-pattern] read_file(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      {
        text: '(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '        ↳ [memory-closure] read_file(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      {
        text: '(file_path: "/hot-functions/application.json", offset: 0, limit: 200)',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '        ↳ [listener-leak] read_file(file_path: "/listener-tracking.json", offset: 0, limit: 200)',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      {
        text: '(file_path: "/listener-tracking.json", offset: 0, limit: 200)',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    100% [code-pattern] ✓ Read all source files and profiling data',
    delay: 500,
    segments: [
      { text: '    100% ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Read all source files and profiling data', className: 'term-text' },
    ],
  },
  {
    text: '     50% [code-pattern] ▸ Analyze all application source files for performance issues',
    delay: 300,
    segments: [
      { text: '     50% ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      {
        text: 'Analyze all application source files for performance issues',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     67% [code-pattern] ✓ Analyze all application source files for performance issues',
    delay: 120,
    segments: [
      { text: '     67% ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze all application source files for performance issues',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     67% [code-pattern] ▸ Compile and report all findings with beforeCode/afterCode',
    delay: 300,
    segments: [
      { text: '     67% ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      { text: 'Compile and report all findings with beforeCode/afterCode', className: 'term-text' },
    ],
  },
  {
    text: '        ↳ [memory-closure] grep(pattern: "analytics-service", path: "/src", glob: "*.ts")',
    delay: 600,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' grep', className: 'term-cyan' },
      {
        text: '(pattern: "analytics-service", path: "/src", glob: "*.ts")',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '        ↳ [listener-leak] grep(pattern: "getAnalytics", path: "/src", glob: "**/*.ts")',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' grep', className: 'term-cyan' },
      { text: '(pattern: "getAnalytics", path: "/src", glob: "**/*.ts")', className: 'term-muted' },
    ],
  },
  {
    text: '        ↳ [listener-leak] read_file(file_path: "/tests/task-service.test.ts", offset: 200, limit: 100)',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      {
        text: '(file_path: "/tests/task-service.test.ts", offset: 200, limit: 100)',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '     75% [cpu-hotspot] ✓ Read all source/data files (DONE)',
    delay: 500,
    segments: [
      { text: '     75% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Read all source/data files (DONE)', className: 'term-text' },
    ],
  },
  {
    text: '     60% [cpu-hotspot] ▸ Analyze hot-functions and application source for blocking operations',
    delay: 300,
    segments: [
      { text: '     60% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      {
        text: 'Analyze hot-functions and application source for blocking operations',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     50% [cpu-hotspot] ▸ Analyze for excessive object instantiation',
    delay: 300,
    segments: [
      { text: '     50% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      { text: 'Analyze for excessive object instantiation', className: 'term-text' },
    ],
  },
  {
    text: '     43% [cpu-hotspot] ▸ Identify compound blockers (callers of blocking functions)',
    delay: 300,
    segments: [
      { text: '     43% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      {
        text: 'Identify compound blockers (callers of blocking functions)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     44% [cpu-hotspot] ✓ Analyze hot-functions and application source for blocking operations',
    delay: 120,
    segments: [
      { text: '     44% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze hot-functions and application source for blocking operations',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     56% [cpu-hotspot] ✓ Analyze for excessive object instantiation',
    delay: 120,
    segments: [
      { text: '     56% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Analyze for excessive object instantiation', className: 'term-text' },
    ],
  },
  {
    text: '     67% [cpu-hotspot] ✓ Identify compound blockers (callers of blocking functions)',
    delay: 120,
    segments: [
      { text: '     67% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Identify compound blockers (callers of blocking functions)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     78% [cpu-hotspot] ✓ Check listener tracking data for leaks/exceedances',
    delay: 120,
    segments: [
      { text: '     78% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Check listener tracking data for leaks/exceedances', className: 'term-text' },
    ],
  },
  {
    text: '     78% [cpu-hotspot] ▸ Compile all findings with beforeCode/afterCode',
    delay: 300,
    segments: [
      { text: '     78% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      { text: 'Compile all findings with beforeCode/afterCode', className: 'term-text' },
    ],
  },
  {
    text: '        ↳ [memory-closure] ls(path: "/src/services")',
    delay: 600,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ls', className: 'term-cyan' },
      { text: '(path: "/src/services")', className: 'term-muted' },
    ],
  },
  {
    text: '        ↳ [listener-leak] glob(pattern: "**/analytics-service*", path: "/")',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' glob', className: 'term-cyan' },
      { text: '(pattern: "**/analytics-service*", path: "/")', className: 'term-muted' },
    ],
  },
  {
    text: '        ↳ [listener-leak] read_file(file_path: "/summary.json", offset: 0, limit: 50)',
    delay: 200,
    segments: [
      { text: '        ↳ ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' read_file', className: 'term-cyan' },
      { text: '(file_path: "/summary.json", offset: 0, limit: 50)', className: 'term-muted' },
    ],
  },
  {
    text: '     80% [memory-closure] ✓ Analyze notification-service.ts for unbounded data structures and closure leaks',
    delay: 500,
    segments: [
      { text: '     80% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze notification-service.ts for unbounded data structures and closure leaks',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     82% [memory-closure] ✓ Analyze db.ts for unbounded audit log',
    delay: 120,
    segments: [
      { text: '     82% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Analyze db.ts for unbounded audit log', className: 'term-text' },
    ],
  },
  {
    text: '     83% [memory-closure] ✓ Analyze task-service.ts for unbounded audit log and closure patterns',
    delay: 120,
    segments: [
      { text: '     83% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze task-service.ts for unbounded audit log and closure patterns',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     85% [memory-closure] ✓ Analyze notification-service.ts for event listener leak (subscribe without unsubscribe)',
    delay: 120,
    segments: [
      { text: '     85% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze notification-service.ts for event listener leak (subscribe without unsubscribe)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     86% [memory-closure] ✓ Cross-reference with listener-tracking.json for exceedances',
    delay: 120,
    segments: [
      { text: '     86% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Cross-reference with listener-tracking.json for exceedances',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     80% [memory-closure] ▸ Write up all findings with verbatim beforeCode and afterCode',
    delay: 300,
    segments: [
      { text: '     80% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      {
        text: 'Write up all findings with verbatim beforeCode and afterCode',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     81% [listener-leak] ✓ Read all data and source files',
    delay: 500,
    segments: [
      { text: '     81% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Read all data and source files', className: 'term-text' },
    ],
  },
  {
    text: '     82% [listener-leak] ✓ Analyze listener-tracking.json for exceedances and imbalances',
    delay: 120,
    segments: [
      { text: '     82% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Analyze listener-tracking.json for exceedances and imbalances',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     83% [listener-leak] ✓ Identify Pattern A: subscribe() in notification-service.ts accumulates listeners',
    delay: 120,
    segments: [
      { text: '     83% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Identify Pattern A: subscribe() in notification-service.ts accumulates listeners',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     84% [listener-leak] ✓ Identify Pattern B: subscribe() returns void — no unsubscribe mechanism',
    delay: 120,
    segments: [
      { text: '     84% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Identify Pattern B: subscribe() returns void — no unsubscribe mechanism',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     85% [listener-leak] ✓ Identify Pattern C: task:changed maxListeners exceedance (11 > 10 threshold)',
    delay: 120,
    segments: [
      { text: '     85% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Identify Pattern C: task:changed maxListeners exceedance (11 > 10 threshold)',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     86% [listener-leak] ✓ Identify task-service.test.ts adds listeners without cleanup',
    delay: 120,
    segments: [
      { text: '     86% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Identify task-service.test.ts adds listeners without cleanup',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     82% [listener-leak] ▸ Write complete analysis with all findings',
    delay: 300,
    segments: [
      { text: '     82% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ▸ ', className: 'term-pending' },
      { text: 'Write complete analysis with all findings', className: 'term-text' },
    ],
  },
  {
    text: '     86% [listener-leak] ✓ Write complete analysis with all findings',
    delay: 120,
    segments: [
      { text: '     86% ', className: 'term-muted' },
      { text: '[listener-leak]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Write complete analysis with all findings', className: 'term-text' },
    ],
  },
  {
    text: '     91% [memory-closure] ✓ Write up all findings with verbatim beforeCode and afterCode',
    delay: 120,
    segments: [
      { text: '     91% ', className: 'term-muted' },
      { text: '[memory-closure]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      {
        text: 'Write up all findings with verbatim beforeCode and afterCode',
        className: 'term-text',
      },
    ],
  },
  {
    text: '     95% [code-pattern] ✓ Compile and report all findings with beforeCode/afterCode',
    delay: 120,
    segments: [
      { text: '     95% ', className: 'term-muted' },
      { text: '[code-pattern]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Compile and report all findings with beforeCode/afterCode', className: 'term-text' },
    ],
  },
  {
    text: '    100% [cpu-hotspot] ✓ Compile all findings with beforeCode/afterCode',
    delay: 120,
    segments: [
      { text: '    100% ', className: 'term-muted' },
      { text: '[cpu-hotspot]', className: 'term-agent' },
      { text: ' ✓ ', className: 'term-success' },
      { text: 'Compile all findings with beforeCode/afterCode', className: 'term-text' },
    ],
  },

  // ── Phase 6 — Final Report ──
  { text: '', delay: 800 },
  {
    text: 'zeitzeuge: Performance Analysis',
    delay: 300,
    segments: [
      { text: 'zeitzeuge:', className: 'term-cyan' },
      { text: ' Performance Analysis', className: 'term-heading' },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  CRITICAL [Blocking I/O]: hashPassword blocks event loop with 10K-iteration CPU loop',
    delay: 600,
    segments: [
      { text: '  CRITICAL', className: 'term-critical' },
      { text: ' [Blocking I/O]: ', className: 'term-muted' },
      {
        text: 'hashPassword blocks event loop with 10K-iteration CPU loop',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    Impact: 2ms',
    delay: 80,
    segments: [
      { text: '    Impact:', className: 'term-text' },
      { text: ' 2ms', className: 'term-value' },
    ],
  },
  {
    text: '    The hashPassword function contains a synchronous for-loop running 10,000 iterations of string concatenation and hashing',
    delay: 80,
    segments: [
      {
        text: '    The hashPassword function contains a synchronous for-loop running 10,000 iterations of string concatenation and hashing',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    logic, blocking the event loop for the entire duration.',
    delay: 80,
    segments: [
      {
        text: '    logic, blocking the event loop for the entire duration.',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    Suggested fix:',
    delay: 80,
    segments: [{ text: '    Suggested fix:', className: 'term-heading' }],
  },
  {
    text: '      Replace the synchronous CPU-bound loop with an async implementation using crypto.subtle.digest or offload to a worker',
    delay: 80,
    segments: [
      {
        text: '      Replace the synchronous CPU-bound loop with an async implementation using crypto.subtle.digest or offload to a worker',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '      thread.',
    delay: 80,
    segments: [{ text: '      thread.', className: 'term-muted' }],
  },
  { text: '', delay: 80 },
  {
    text: '  CRITICAL [Blocking I/O]: generateToken compounds blocking by calling synchronous hashPassword',
    delay: 600,
    segments: [
      { text: '  CRITICAL', className: 'term-critical' },
      { text: ' [Blocking I/O]: ', className: 'term-muted' },
      {
        text: 'generateToken compounds blocking by calling synchronous hashPassword',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    Impact: 2ms',
    delay: 80,
    segments: [
      { text: '    Impact:', className: 'term-text' },
      { text: ' 2ms', className: 'term-value' },
    ],
  },
  {
    text: '    generateToken calls hashPassword, which blocks the event loop with a 10K-iteration loop.',
    delay: 80,
    segments: [
      {
        text: '    generateToken calls hashPassword, which blocks the event loop with a 10K-iteration loop.',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    Suggested fix:',
    delay: 80,
    segments: [{ text: '    Suggested fix:', className: 'term-heading' }],
  },
  {
    text: '      Make generateToken async and await the async hashPassword to avoid compound blocking.',
    delay: 80,
    segments: [
      {
        text: '      Make generateToken async and await the async hashPassword to avoid compound blocking.',
        className: 'term-muted',
      },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  CRITICAL [Listener Leak]: task:changed exceeds maxListeners threshold (11 > 10)',
    delay: 600,
    segments: [
      { text: '  CRITICAL', className: 'term-critical' },
      { text: ' [Listener Leak]: ', className: 'term-muted' },
      { text: 'task:changed exceeds maxListeners threshold (11 > 10)', className: 'term-text' },
    ],
  },
  {
    text: '    Impact: 2ms',
    delay: 80,
    segments: [
      { text: '    Impact:', className: 'term-text' },
      { text: ' 2ms', className: 'term-value' },
    ],
  },
  {
    text: "    The 'task:changed' event has accumulated 11 listeners (exceeding the default maxListeners of 10), with 15 total adds",
    delay: 80,
    segments: [
      {
        text: "    The 'task:changed' event has accumulated 11 listeners (exceeding the default maxListeners of 10), with 15 total adds",
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    and 0 removes.',
    delay: 80,
    segments: [{ text: '    and 0 removes.', className: 'term-muted' }],
  },
  {
    text: '    Suggested fix:',
    delay: 80,
    segments: [{ text: '    Suggested fix:', className: 'term-heading' }],
  },
  {
    text: '      Return an unsubscribe function that calls db.events.off() and removes the subscription.',
    delay: 80,
    segments: [
      {
        text: '      Return an unsubscribe function that calls db.events.off() and removes the subscription.',
        className: 'term-muted',
      },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  WARNING [Excessive Allocation]: Per-call Intl.DateTimeFormat, TextEncoder, and Map allocation in sendNotification',
    delay: 400,
    segments: [
      { text: '  WARNING', className: 'term-warning' },
      { text: ' [Excessive Allocation]: ', className: 'term-muted' },
      {
        text: 'Per-call Intl.DateTimeFormat, TextEncoder, and Map allocation in sendNotification',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    Impact: 2ms',
    delay: 80,
    segments: [
      { text: '    Impact:', className: 'term-text' },
      { text: ' 2ms', className: 'term-value' },
    ],
  },
  {
    text: '    sendNotification creates new Intl.DateTimeFormat, TextEncoder, and Map instances on every call.',
    delay: 80,
    segments: [
      {
        text: '    sendNotification creates new Intl.DateTimeFormat, TextEncoder, and Map instances on every call.',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    Suggested fix:',
    delay: 80,
    segments: [{ text: '    Suggested fix:', className: 'term-heading' }],
  },
  {
    text: '      Hoist Intl.DateTimeFormat and TextEncoder to module scope, and replace the Map with a plain object literal.',
    delay: 80,
    segments: [
      {
        text: '      Hoist Intl.DateTimeFormat and TextEncoder to module scope, and replace the Map with a plain object literal.',
        className: 'term-muted',
      },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  WARNING [Event Handling]: subscribe() returns void — no way for callers to unsubscribe',
    delay: 400,
    segments: [
      { text: '  WARNING', className: 'term-warning' },
      { text: ' [Event Handling]: ', className: 'term-muted' },
      {
        text: 'subscribe() returns void — no way for callers to unsubscribe',
        className: 'term-text',
      },
    ],
  },
  {
    text: '    Impact: 2ms',
    delay: 80,
    segments: [
      { text: '    Impact:', className: 'term-text' },
      { text: ' 2ms', className: 'term-value' },
    ],
  },
  {
    text: '    The subscribe method in NotificationService returns void, providing callers with no mechanism to remove the listener.',
    delay: 80,
    segments: [
      {
        text: '    The subscribe method in NotificationService returns void, providing callers with no mechanism to remove the listener.',
        className: 'term-muted',
      },
    ],
  },
  {
    text: '    Suggested fix:',
    delay: 80,
    segments: [{ text: '    Suggested fix:', className: 'term-heading' }],
  },
  {
    text: '      Change subscribe() to return an unsubscribe function that calls db.events.off().',
    delay: 80,
    segments: [
      {
        text: '      Change subscribe() to return an unsubscribe function that calls db.events.off().',
        className: 'term-muted',
      },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  ...8 more warnings, 11 info',
    delay: 300,
    segments: [{ text: '  ...8 more warnings, 11 info', className: 'term-muted' }],
  },
  { text: '', delay: 80 },
  {
    text: '  Summary: 3 critical, 12 warning, 11 info',
    delay: 400,
    segments: [
      { text: '  Summary: ', className: 'term-heading' },
      { text: '3 critical', className: 'term-critical' },
      { text: ', ', className: 'term-text' },
      { text: '12 warning', className: 'term-warning' },
      { text: ', ', className: 'term-text' },
      { text: '11 info', className: 'term-info' },
    ],
  },
  { text: '', delay: 80 },
  {
    text: '  Report written to /home/alex/project/zeitzeuge-report.md',
    delay: 80,
    segments: [
      { text: '  Report written to ', className: 'term-text' },
      { text: '/home/alex/project/zeitzeuge-report.md', className: 'term-path' },
    ],
  },
];
