import { test, expect, describe } from 'bun:test';

import { extractFunctionName, deduplicateFindings, rankFindings } from './deduplication.js';
import type { Finding } from '@zeitzeuge/utils';

function makeFinding(overrides: Partial<Finding> = {}): Finding {
  return {
    severity: 'warning',
    title: 'Test finding',
    description: 'A test finding description',
    category: 'hot-function',
    suggestedFix: 'Fix it',
    ...overrides,
  };
}

// ── extractFunctionName ─────────────────────────────────────

describe('extractFunctionName', () => {
  test('extracts from hotFunction field', () => {
    const f = makeFinding({
      hotFunction: {
        name: 'hashPassword',
        scriptUrl: '',
        lineNumber: 0,
        selfTime: 0,
        selfPercent: 0,
      },
    });
    expect(extractFunctionName(f)).toBe('hashPassword');
  });

  test('extracts functionName() from title', () => {
    const f = makeFinding({ title: 'hashPassword() blocks the event loop' });
    expect(extractFunctionName(f)).toBe('hashPassword');
  });

  test('extracts backtick-quoted name from description', () => {
    const f = makeFinding({ description: 'The `computeTagCorrelations` function is O(n²)' });
    expect(extractFunctionName(f)).toBe('computeTagCorrelations');
  });

  test('prefers hotFunction.name over text match', () => {
    const f = makeFinding({
      title: 'someOther() is slow',
      hotFunction: { name: 'realName', scriptUrl: '', lineNumber: 0, selfTime: 0, selfPercent: 0 },
    });
    expect(extractFunctionName(f)).toBe('realName');
  });

  test('returns null when no function name found', () => {
    const f = makeFinding({ title: 'General performance issue', description: 'Something is slow' });
    expect(extractFunctionName(f)).toBeNull();
  });
});

// ── deduplicateFindings ─────────────────────────────────────

describe('deduplicateFindings', () => {
  test('keeps unique findings unchanged', () => {
    const findings = [
      makeFinding({
        title: 'hashPassword() blocks',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
      }),
      makeFinding({
        title: 'getAnalytics() leaks',
        sourceFile: '/src/analytics.ts',
        category: 'listener-leak',
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  test('deduplicates same file + function + category', () => {
    const findings = [
      makeFinding({
        title: 'hashPassword() blocks',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
        beforeCode: 'before',
        afterCode: 'after',
        confidence: 'high',
      }),
      makeFinding({
        title: 'hashPassword() is CPU-intensive',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
        confidence: 'medium',
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    // Should keep the one with beforeCode+afterCode and higher confidence
    expect(result[0]!.confidence).toBe('high');
  });

  test('preserves cross-category findings for same function', () => {
    const findings = [
      makeFinding({
        title: 'hashPassword() blocks the event loop',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
      }),
      makeFinding({
        title: 'hashPassword() allocates TextEncoder per call',
        sourceFile: '/src/crypto.ts',
        category: 'allocation',
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  test('does not deduplicate findings without sourceFile', () => {
    const findings = [
      makeFinding({ title: 'hashPassword() issue A', category: 'blocking-io' }),
      makeFinding({ title: 'hashPassword() issue B', category: 'blocking-io' }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  test('does not deduplicate findings without extractable function name', () => {
    const findings = [
      makeFinding({
        title: 'General issue',
        sourceFile: '/src/crypto.ts',
        category: 'hot-function',
      }),
      makeFinding({
        title: 'Another issue',
        sourceFile: '/src/crypto.ts',
        category: 'hot-function',
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  test('handles empty input', () => {
    expect(deduplicateFindings([])).toHaveLength(0);
  });

  test('handles single finding', () => {
    const findings = [
      makeFinding({ title: 'hashPassword() blocks', sourceFile: '/src/crypto.ts' }),
    ];
    expect(deduplicateFindings(findings)).toHaveLength(1);
  });

  test('prefers finding with beforeCode and afterCode', () => {
    const findings = [
      makeFinding({
        title: 'hashPassword() blocks',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
        confidence: 'high',
        severity: 'critical',
        // no beforeCode/afterCode
      }),
      makeFinding({
        title: 'hashPassword() is blocking',
        sourceFile: '/src/crypto.ts',
        category: 'blocking-io',
        confidence: 'medium',
        severity: 'warning',
        beforeCode: 'const hash = ...',
        afterCode: 'const hash = await ...',
      }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(1);
    // Should prefer the one with beforeCode+afterCode despite lower severity
    expect(result[0]!.beforeCode).toBe('const hash = ...');
  });
});

// ── rankFindings ────────────────────────────────────────────

describe('rankFindings', () => {
  test('sorts by severity: critical > warning > info', () => {
    const findings = [
      makeFinding({ severity: 'info', title: 'info' }),
      makeFinding({ severity: 'critical', title: 'critical' }),
      makeFinding({ severity: 'warning', title: 'warning' }),
    ];
    const ranked = rankFindings(findings);
    expect(ranked[0]!.severity).toBe('critical');
    expect(ranked[1]!.severity).toBe('warning');
    expect(ranked[2]!.severity).toBe('info');
  });

  test('within same severity, sorts by impactMs descending', () => {
    const findings = [
      makeFinding({ severity: 'warning', impactMs: 50, title: 'low impact' }),
      makeFinding({ severity: 'warning', impactMs: 200, title: 'high impact' }),
      makeFinding({ severity: 'warning', impactMs: 100, title: 'mid impact' }),
    ];
    const ranked = rankFindings(findings);
    expect(ranked[0]!.impactMs).toBe(200);
    expect(ranked[1]!.impactMs).toBe(100);
    expect(ranked[2]!.impactMs).toBe(50);
  });

  test('within same severity and impact, sorts by confidence', () => {
    const findings = [
      makeFinding({ severity: 'warning', impactMs: 100, confidence: 'low', title: 'low' }),
      makeFinding({ severity: 'warning', impactMs: 100, confidence: 'high', title: 'high' }),
      makeFinding({ severity: 'warning', impactMs: 100, confidence: 'medium', title: 'med' }),
    ];
    const ranked = rankFindings(findings);
    expect(ranked[0]!.confidence).toBe('high');
    expect(ranked[1]!.confidence).toBe('medium');
    expect(ranked[2]!.confidence).toBe('low');
  });

  test('does not mutate input', () => {
    const findings = [
      makeFinding({ severity: 'info', title: 'a' }),
      makeFinding({ severity: 'critical', title: 'b' }),
    ];
    const original = [...findings];
    rankFindings(findings);
    expect(findings[0]!.severity).toBe(original[0]!.severity);
    expect(findings[1]!.severity).toBe(original[1]!.severity);
  });

  test('handles empty input', () => {
    expect(rankFindings([])).toHaveLength(0);
  });
});
