import { test, expect, describe } from 'bun:test';
import {
  extractFunctionName,
  deduplicateFindings,
  rankFindings,
  findingQualityScore,
  severityRank,
  confidenceRank,
} from '../../src/analysis/deduplication';
import type { Finding } from '../../src/types';

// ── Helper to create a minimal finding ──

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

// ── extractFunctionName ──

describe('extractFunctionName', () => {
  test('extracts from hotFunction.name', () => {
    const finding = makeFinding({
      hotFunction: {
        name: 'hashPassword',
        scriptUrl: '/src/crypto.ts',
        lineNumber: 10,
        selfTime: 100,
        selfPercent: 5,
      },
    });
    expect(extractFunctionName(finding)).toBe('hashPassword');
  });

  test('extracts from "functionName()" pattern in title', () => {
    const finding = makeFinding({ title: 'Blocking call in processData()' });
    expect(extractFunctionName(finding)).toBe('processData');
  });

  test('extracts from backtick-quoted identifier in description', () => {
    const finding = makeFinding({
      title: 'Performance issue',
      description: 'The `computeCorrelations` function has O(n²) complexity',
    });
    expect(extractFunctionName(finding)).toBe('computeCorrelations');
  });

  test('returns null when no function name found', () => {
    const finding = makeFinding({
      title: 'General issue',
      description: 'Something is slow',
    });
    expect(extractFunctionName(finding)).toBeNull();
  });

  test('prefers hotFunction.name over title pattern', () => {
    const finding = makeFinding({
      title: 'Issue in otherFunc()',
      hotFunction: {
        name: 'realFunc',
        scriptUrl: '/src/foo.ts',
        lineNumber: 1,
        selfTime: 50,
        selfPercent: 2,
      },
    });
    expect(extractFunctionName(finding)).toBe('realFunc');
  });
});

// ── severityRank / confidenceRank ──

describe('severityRank', () => {
  test('critical < warning < info', () => {
    expect(severityRank('critical')).toBeLessThan(severityRank('warning'));
    expect(severityRank('warning')).toBeLessThan(severityRank('info'));
  });

  test('undefined defaults to info', () => {
    expect(severityRank(undefined)).toBe(severityRank('info'));
  });
});

describe('confidenceRank', () => {
  test('high < medium < low', () => {
    expect(confidenceRank('high')).toBeLessThan(confidenceRank('medium'));
    expect(confidenceRank('medium')).toBeLessThan(confidenceRank('low'));
  });
});

// ── findingQualityScore ──

describe('findingQualityScore', () => {
  test('finding with beforeCode + afterCode scores higher', () => {
    const withCode = makeFinding({
      beforeCode: 'const x = 1;',
      afterCode: 'const x = 2;',
    });
    const withoutCode = makeFinding({});
    expect(findingQualityScore(withCode)).toBeGreaterThan(findingQualityScore(withoutCode));
  });

  test('higher severity scores higher', () => {
    const critical = makeFinding({ severity: 'critical' });
    const info = makeFinding({ severity: 'info' });
    expect(findingQualityScore(critical)).toBeGreaterThan(findingQualityScore(info));
  });

  test('finding with sourceFile scores higher', () => {
    const withFile = makeFinding({ sourceFile: '/src/foo.ts' });
    const withoutFile = makeFinding({});
    expect(findingQualityScore(withFile)).toBeGreaterThan(findingQualityScore(withoutFile));
  });
});

// ── deduplicateFindings ──

describe('deduplicateFindings', () => {
  test('passes through findings without sourceFile/functionName', () => {
    const findings = [
      makeFinding({ title: 'General issue', description: 'No function name' }),
      makeFinding({ title: 'Another issue', description: 'Also no function name' }),
    ];
    const result = deduplicateFindings(findings);
    expect(result).toHaveLength(2);
  });

  test('deduplicates same function + same category, keeps best', () => {
    const lower = makeFinding({
      title: 'Issue in hashPassword()',
      sourceFile: '/src/crypto.ts',
      category: 'blocking-io',
      severity: 'info',
    });
    const higher = makeFinding({
      title: 'Issue in hashPassword()',
      sourceFile: '/src/crypto.ts',
      category: 'blocking-io',
      severity: 'critical',
      beforeCode: 'const x = 1;',
      afterCode: 'const x = 2;',
    });
    const result = deduplicateFindings([lower, higher]);
    expect(result).toHaveLength(1);
    expect(result[0]!.severity).toBe('critical');
  });

  test('preserves cross-category findings for same function', () => {
    const blocking = makeFinding({
      title: 'hashPassword() blocks event loop',
      sourceFile: '/src/crypto.ts',
      category: 'blocking-io',
    });
    const allocation = makeFinding({
      title: 'hashPassword() allocates TextEncoder per call',
      sourceFile: '/src/crypto.ts',
      category: 'allocation',
    });
    const result = deduplicateFindings([blocking, allocation]);
    expect(result).toHaveLength(2);
    const categories = result.map((f) => f.category).sort();
    expect(categories).toEqual(['allocation', 'blocking-io']);
  });

  test('handles mixed groupable and ungroupable findings', () => {
    const groupable1 = makeFinding({
      title: 'Issue in processData()',
      sourceFile: '/src/process.ts',
      category: 'algorithm',
    });
    const groupable2 = makeFinding({
      title: 'Issue in processData()',
      sourceFile: '/src/process.ts',
      category: 'algorithm',
      beforeCode: 'code',
      afterCode: 'fixed',
    });
    const ungroupable = makeFinding({
      title: 'General observation',
      description: 'No function reference',
    });
    const result = deduplicateFindings([groupable1, groupable2, ungroupable]);
    expect(result).toHaveLength(2); // 1 deduped + 1 ungroupable
  });
});

// ── rankFindings ──

describe('rankFindings', () => {
  test('sorts by severity: critical > warning > info', () => {
    const info = makeFinding({ severity: 'info' });
    const critical = makeFinding({ severity: 'critical' });
    const warning = makeFinding({ severity: 'warning' });
    const result = rankFindings([info, critical, warning]);
    expect(result.map((f) => f.severity)).toEqual(['critical', 'warning', 'info']);
  });

  test('sorts by impactMs descending within same severity', () => {
    const low = makeFinding({ severity: 'warning', impactMs: 50 });
    const high = makeFinding({ severity: 'warning', impactMs: 500 });
    const mid = makeFinding({ severity: 'warning', impactMs: 200 });
    const result = rankFindings([low, high, mid]);
    expect(result.map((f) => f.impactMs)).toEqual([500, 200, 50]);
  });

  test('sorts by confidence within same severity and impactMs', () => {
    const low = makeFinding({ severity: 'warning', impactMs: 100, confidence: 'low' });
    const high = makeFinding({ severity: 'warning', impactMs: 100, confidence: 'high' });
    const result = rankFindings([low, high]);
    expect(result.map((f) => f.confidence)).toEqual(['high', 'low']);
  });

  test('does not mutate input array', () => {
    const findings = [makeFinding({ severity: 'info' }), makeFinding({ severity: 'critical' })];
    const original = [...findings];
    rankFindings(findings);
    expect(findings.map((f) => f.severity)).toEqual(original.map((f) => f.severity));
  });
});
