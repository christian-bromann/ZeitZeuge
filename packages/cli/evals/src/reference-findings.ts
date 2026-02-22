/**
 * Ground truth: known performance flaws in the CLI eval fixture site.
 *
 * Each entry maps to a specific, deliberate performance issue in the
 * fixture-site/ React+Vite app. Evaluators compare CLI agent findings
 * against these references to score detection coverage.
 */

export type FlawCategory =
  | 'render-blocking'
  | 'code-pattern'
  | 'runtime-blocking'
  | 'memory-issue'
  | 'listener-leak';

export interface ReferenceFinding {
  id: string;
  category: FlawCategory;
  sourceFile: string;
  functionName: string;
  lineNumber?: number;
  flawType: string;
  description: string;
  expectedCategories: string[];
  expectedSeverity: 'critical' | 'warning' | 'info';
  keywords: string[];
}

export const REFERENCE_FINDINGS: ReferenceFinding[] = [
  // ─── Render-Blocking (3) ──────────────────────────────────

  {
    id: 'blocking-inline-script',
    category: 'render-blocking',
    sourceFile: 'index.html',
    functionName: '(inline script)',
    flawType: 'render-blocking-inline-script',
    description:
      'index.html contains a synchronous inline <script> in <head> that runs a 50,000-iteration loop, blocking FCP.',
    expectedCategories: ['render-blocking', 'long-task', 'frame-blocking-function'],
    expectedSeverity: 'critical',
    keywords: [
      'inline',
      'script',
      'blocking',
      'render',
      'head',
      'synchronous',
      'loop',
      'FCP',
      '__APP_CONFIG',
    ],
  },
  {
    id: 'blocking-external-script',
    category: 'render-blocking',
    sourceFile: 'src/utils/analytics-blocking.js',
    functionName: '(IIFE)',
    flawType: 'render-blocking-external-script',
    description:
      'analytics-blocking.js is loaded synchronously in <head> without async/defer, blocking rendering.',
    expectedCategories: ['render-blocking', 'long-task', 'frame-blocking-function'],
    expectedSeverity: 'critical',
    keywords: [
      'analytics',
      'blocking',
      'render',
      'script',
      'async',
      'defer',
      'synchronous',
      'head',
    ],
  },
  {
    id: 'css-import-chain',
    category: 'render-blocking',
    sourceFile: 'src/styles/reset.css',
    functionName: '@import',
    flawType: 'css-import-waterfall',
    description:
      'reset.css uses @import url("./fonts.css"), creating a sequential CSS waterfall that delays rendering.',
    expectedCategories: ['render-blocking', 'waterfall-bottleneck', 'large-asset'],
    expectedSeverity: 'warning',
    keywords: ['@import', 'CSS', 'waterfall', 'sequential', 'fonts', 'render', 'blocking', 'chain'],
  },

  // ─── Code Patterns (4) ────────────────────────────────────

  {
    id: 'images-no-dimensions',
    category: 'code-pattern',
    sourceFile: 'index.html',
    functionName: '(HTML)',
    flawType: 'missing-image-dimensions',
    description:
      'Two <img> elements in index.html lack explicit width and height attributes, causing layout shifts (CLS).',
    expectedCategories: ['other', 'render-blocking', 'large-asset'],
    expectedSeverity: 'warning',
    keywords: ['img', 'width', 'height', 'layout shift', 'CLS', 'dimension'],
  },
  {
    id: 'universal-transition',
    category: 'code-pattern',
    sourceFile: 'src/styles/theme.css',
    functionName: '(CSS)',
    flawType: 'expensive-universal-selector',
    description:
      '* { transition: all 0.3s ease } in theme.css applies transitions to every element, causing jank on DOM changes.',
    expectedCategories: ['other', 'long-task', 'frame-blocking-function'],
    expectedSeverity: 'warning',
    keywords: ['transition', 'all', 'universal', '*', 'jank', 'CSS', 'every element', 'selector'],
  },
  {
    id: 'synchronous-xhr',
    category: 'code-pattern',
    sourceFile: 'src/components/ItemList.tsx',
    functionName: 'handleItemClick',
    flawType: 'synchronous-xhr',
    description:
      'handleItemClick() uses synchronous XMLHttpRequest (xhr.open with false), blocking the main thread during the request.',
    expectedCategories: ['blocking-io', 'long-task', 'frame-blocking-function'],
    expectedSeverity: 'critical',
    keywords: ['XMLHttpRequest', 'synchronous', 'xhr', 'blocking', 'sync', 'open', 'false'],
  },
  {
    id: 'dom-manipulation-loop',
    category: 'code-pattern',
    sourceFile: 'src/components/Dashboard.tsx',
    functionName: 'Dashboard',
    flawType: 'dom-manipulation-in-loop',
    description:
      'Dashboard creates DOM elements in a loop with document.createElement and appendChild, bypassing React virtual DOM.',
    expectedCategories: [
      'other',
      'long-task',
      'unnecessary-computation',
      'frame-blocking-function',
    ],
    expectedSeverity: 'warning',
    keywords: [
      'createElement',
      'appendChild',
      'DOM',
      'loop',
      'manipulation',
      'document',
      'virtual DOM',
    ],
  },

  // ─── Runtime Blocking (3) ──────────────────────────────────

  {
    id: 'heavy-init-blocking',
    category: 'runtime-blocking',
    sourceFile: 'src/utils/heavy-init.ts',
    functionName: 'heavyInitialization',
    flawType: 'main-thread-blocking',
    description:
      'heavyInitialization() runs synchronous O(n) work with per-iteration Date/RegExp creation and JSON deep cloning, blocking the main thread during mount.',
    expectedCategories: [
      'long-task',
      'hot-function',
      'frame-blocking-function',
      'unnecessary-computation',
    ],
    expectedSeverity: 'warning',
    keywords: [
      'heavyInitialization',
      'blocking',
      'main thread',
      'JSON',
      'clone',
      'RegExp',
      'Date',
      'synchronous',
    ],
  },
  {
    id: 'quadratic-tag-overlap',
    category: 'runtime-blocking',
    sourceFile: 'src/components/Dashboard.tsx',
    functionName: 'Dashboard',
    flawType: 'quadratic-algorithm',
    description:
      'Dashboard useEffect runs O(n² × m²) nested loops comparing all item tag pairs on every render.',
    expectedCategories: ['algorithm', 'unnecessary-computation', 'hot-function', 'long-task'],
    expectedSeverity: 'warning',
    keywords: ['O(n', 'quadratic', 'nested', 'loop', 'tags', 'overlap', 'pair', 'every render'],
  },
  {
    id: 'layout-thrashing',
    category: 'runtime-blocking',
    sourceFile: 'src/components/App.tsx',
    functionName: 'App',
    flawType: 'layout-thrashing',
    description:
      'Scroll handler reads getBoundingClientRect then immediately writes style.opacity and style.transform, forcing synchronous layout recalculations.',
    expectedCategories: ['long-task', 'frame-blocking-function', 'other'],
    expectedSeverity: 'warning',
    keywords: [
      'layout',
      'thrashing',
      'getBoundingClientRect',
      'offsetHeight',
      'reflow',
      'scroll',
      'style',
      'read',
      'write',
    ],
  },

  // ─── Memory Issues (2) ─────────────────────────────────────

  {
    id: 'detached-dom-nodes',
    category: 'memory-issue',
    sourceFile: 'src/components/ItemList.tsx',
    functionName: 'ItemList',
    flawType: 'detached-dom-accumulation',
    description:
      'ItemList stores ever-growing detached DOM nodes in a ref. Old nodes are never released, causing memory growth.',
    expectedCategories: [
      'memory-leak',
      'detached-dom',
      'gc-pressure',
      'large-retained-object',
      'allocation',
    ],
    expectedSeverity: 'warning',
    keywords: ['detached', 'DOM', 'node', 'ref', 'memory', 'leak', 'grow', 'createElement'],
  },
  {
    id: 'json-deep-clone',
    category: 'memory-issue',
    sourceFile: 'src/components/ItemList.tsx',
    functionName: 'handleItemClick',
    flawType: 'unnecessary-serialization',
    description:
      'handleItemClick deep-clones data via triple JSON.parse(JSON.stringify(...)) on every click — unnecessary allocation and CPU work.',
    expectedCategories: ['serialization', 'unnecessary-computation', 'allocation'],
    expectedSeverity: 'info',
    keywords: [
      'JSON.parse',
      'JSON.stringify',
      'deep clone',
      'serialize',
      'unnecessary',
      'allocation',
    ],
  },

  // ─── Listener Leaks (2) ────────────────────────────────────

  {
    id: 'listener-leak-resize',
    category: 'listener-leak',
    sourceFile: 'src/components/Dashboard.tsx',
    functionName: 'Dashboard',
    flawType: 'missing-cleanup',
    description:
      'Dashboard registers a resize event listener in useEffect without returning a cleanup function. The listener accumulates on re-renders.',
    expectedCategories: ['listener-leak', 'event-handling', 'gc-pressure', 'memory-leak'],
    expectedSeverity: 'warning',
    keywords: [
      'resize',
      'listener',
      'cleanup',
      'removeEventListener',
      'useEffect',
      'leak',
      'accumulate',
    ],
  },
  {
    id: 'listener-leak-keydown',
    category: 'listener-leak',
    sourceFile: 'src/components/SearchBar.tsx',
    functionName: 'SearchBar',
    flawType: 'missing-cleanup-every-render',
    description:
      'SearchBar adds a keydown listener on every render (useEffect with no deps array and no cleanup), leaking listeners rapidly.',
    expectedCategories: ['listener-leak', 'event-handling', 'gc-pressure', 'memory-leak'],
    expectedSeverity: 'critical',
    keywords: [
      'keydown',
      'listener',
      'cleanup',
      'removeEventListener',
      'useEffect',
      'every render',
      'leak',
    ],
  },
];
