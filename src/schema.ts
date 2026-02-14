import { z } from 'zod';

/**
 * All finding categories — shared between page-load and test-performance analysis.
 *
 * NOTE: We intentionally use `z.string()` instead of `z.enum()` in the Zod
 * schema below.  When `z.enum()` is used with `providerStrategy()`, certain
 * LLM providers (e.g. Anthropic) may emit the structured response in a single
 * turn without exploring the workspace first, resulting in empty findings.
 * Using `z.string()` with a `.describe()` hint keeps the schema flexible for
 * the API while the TypeScript `Finding` type still enforces the union at
 * compile time.
 */
export const ALL_CATEGORIES = [
  // Page-load / runtime categories
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
  // Test / application performance categories
  'slow-test',
  'expensive-setup',
  'hot-function',
  'unnecessary-computation',
  'import-overhead',
  'dependency-bottleneck',
  // Application code analysis categories
  'algorithm',
  'serialization',
  'allocation',
  'event-handling',
  'blocking-io',
  'other',
] as const;

export const FindingSchema = z.object({
  severity: z.enum(['critical', 'warning', 'info']),
  title: z.string().describe('Short title for the finding'),
  description: z.string().describe('Detailed explanation of the issue'),
  category: z
    .string()
    .describe(`Category of the performance issue. Use one of: ${ALL_CATEGORIES.join(', ')}`),
  resourceUrl: z.string().optional().describe('URL of the resource involved'),
  workspacePath: z.string().optional().describe('Path in the VFS workspace'),
  impactMs: z
    .number()
    .optional()
    .describe('Estimated current cost in ms (e.g. selfTime of the hot function)'),
  estimatedSavingsMs: z
    .number()
    .optional()
    .describe(
      'Estimated time savings in ms if the fix is applied. Computed as impactMs × fraction eliminated by the fix.',
    ),
  confidence: z
    .enum(['high', 'medium', 'low'])
    .optional()
    .describe(
      'How confident you are in this finding. high = verified in source code, medium = strong signal but partial verification, low = inferred from data patterns',
    ),
  retainedSize: z.number().optional().describe('Retained heap size in bytes'),
  retainerPath: z.array(z.string()).optional().describe('Object retention path in the heap'),
  sourceFile: z
    .string()
    .optional()
    .describe('Primary source file where the issue occurs (workspace path or original path)'),
  lineNumber: z
    .number()
    .optional()
    .describe('Line number in the source file where the issue occurs (1-based)'),
  suggestedFix: z.string().describe('Code snippet or guidance to fix the issue'),
  beforeCode: z
    .string()
    .optional()
    .describe('The current problematic code snippet from the source file'),
  afterCode: z.string().optional().describe('The improved code snippet that fixes the issue'),
  testFile: z.string().optional().describe('Test file path (for test performance findings)'),
  affectedTests: z
    .array(z.string())
    .optional()
    .describe('Test names that would benefit from this fix (for test performance findings)'),
  hotFunction: z
    .object({
      name: z.string(),
      scriptUrl: z.string(),
      lineNumber: z.number(),
      selfTime: z.number(),
      selfPercent: z.number(),
    })
    .optional()
    .describe('Hot function details (for hot-function findings)'),
});

export const FindingsSchema = z.object({
  findings: z.array(FindingSchema),
});
