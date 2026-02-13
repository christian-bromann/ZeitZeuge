import { test, expect, describe } from 'bun:test';
import { formatBytes } from '../../src/output/terminal';
import type { Finding } from '../../src/types';

describe('formatBytes', () => {
  test('formats bytes correctly', () => {
    expect(formatBytes(0)).toBe('0 B');
    expect(formatBytes(512)).toBe('512 B');
    expect(formatBytes(1023)).toBe('1023 B');
  });

  test('formats kilobytes correctly', () => {
    expect(formatBytes(1024)).toBe('1.0 KB');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(10240)).toBe('10.0 KB');
  });

  test('formats megabytes correctly', () => {
    expect(formatBytes(1048576)).toBe('1.0 MB');
    expect(formatBytes(8600000)).toBe('8.2 MB');
    expect(formatBytes(1073741824)).toBe('1024.0 MB');
  });
});

describe('printFindings', () => {
  test('can be imported without errors', async () => {
    const { printFindings } = await import('../../src/output/terminal');
    expect(typeof printFindings).toBe('function');
  });
});

describe('printFindingsVitest', () => {
  test('can be imported without errors', async () => {
    const { printFindingsVitest } = await import('../../src/output/terminal');
    expect(typeof printFindingsVitest).toBe('function');
  });
});

describe('printHeader', () => {
  test('can be imported without errors', async () => {
    const { printHeader } = await import('../../src/output/terminal');
    expect(typeof printHeader).toBe('function');
  });
});

describe('printError', () => {
  test('can be imported without errors', async () => {
    const { printError } = await import('../../src/output/terminal');
    expect(typeof printError).toBe('function');
  });
});

describe('printCaptureInfo', () => {
  test('can be imported without errors', async () => {
    const { printCaptureInfo } = await import('../../src/output/terminal');
    expect(typeof printCaptureInfo).toBe('function');
  });
});

describe('Finding type compatibility', () => {
  test('memory-type finding with retainedSize compiles', () => {
    const finding: Finding = {
      severity: 'critical',
      title: 'Memory leak in cache',
      description: 'Unbounded cache',
      category: 'memory-leak',
      retainedSize: 5000000,
      retainerPath: ['Window', 'app', 'cache'],
      suggestedFix: 'Add cache eviction',
    };
    expect(finding.category).toBe('memory-leak');
    expect(finding.retainedSize).toBe(5000000);
  });

  test('trace-type finding with impactMs compiles', () => {
    const finding: Finding = {
      severity: 'warning',
      title: 'Render-blocking script',
      description: 'vendor.js blocks first paint',
      category: 'render-blocking',
      resourceUrl: 'http://localhost/vendor.js',
      workspacePath: '/scripts/vendor.js',
      impactMs: 1200,
      suggestedFix: 'Add defer attribute',
    };
    expect(finding.category).toBe('render-blocking');
    expect(finding.impactMs).toBe(1200);
    expect(finding.retainedSize).toBeUndefined();
  });

  test('all category values are valid', () => {
    const categories: Finding['category'][] = [
      'memory-leak',
      'large-retained-object',
      'detached-dom',
      'render-blocking',
      'long-task',
      'unused-code',
      'waterfall-bottleneck',
      'large-asset',
      'frame-blocking-function',
      'listener-leak',
      'gc-pressure',
      'other',
    ];
    expect(categories.length).toBe(12);
  });

  test('frame-blocking-function finding compiles', () => {
    const finding: Finding = {
      severity: 'critical',
      title: 'initializeDataGrid() blocks main thread for 340ms',
      description: 'Synchronous loop over 10,000 rows during page load',
      category: 'frame-blocking-function',
      resourceUrl: 'http://localhost:3000/app.js',
      workspacePath: '/scripts/app.js',
      impactMs: 340,
      suggestedFix: 'Use requestIdleCallback or chunk the work',
    };
    expect(finding.category).toBe('frame-blocking-function');
    expect(finding.impactMs).toBe(340);
  });

  test('listener-leak finding compiles', () => {
    const finding: Finding = {
      severity: 'warning',
      title: '847 "scroll" listeners, 0 removed',
      description: 'addEventListener called without corresponding removeEventListener',
      category: 'listener-leak',
      resourceUrl: 'http://localhost:3000/components.js',
      suggestedFix: 'Add cleanup in useEffect return',
    };
    expect(finding.category).toBe('listener-leak');
  });

  test('gc-pressure finding compiles', () => {
    const finding: Finding = {
      severity: 'info',
      title: '12 major GC pauses (total 180ms)',
      description: 'Frequent allocation + collection cycles',
      category: 'gc-pressure',
      impactMs: 180,
      suggestedFix: 'Reuse objects instead of creating new ones in hot loops',
    };
    expect(finding.category).toBe('gc-pressure');
  });
});
