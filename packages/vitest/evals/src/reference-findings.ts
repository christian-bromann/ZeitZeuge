/**
 * Ground truth: known performance flaws in the example project.
 *
 * Each entry maps to a specific, deliberate performance issue documented
 * in example/README.md. Evaluators compare agent findings against these
 * references to score detection coverage, severity accuracy, etc.
 */

// ── Types ────────────────────────────────────────────────────

export type FlawCategory =
  | 'blocking'
  | 'listener-leak'
  | 'slow-code-path'
  | 'closure-leak'
  | 'excessive-instantiation';

export interface ReferenceFinding {
  /** Unique identifier, e.g. "blocking-hashPassword". */
  id: string;
  /** High-level flaw category. */
  category: FlawCategory;
  /** Relative path from example root, e.g. "src/utils/crypto.ts". */
  sourceFile: string;
  /** Primary function where the flaw lives. */
  functionName: string;
  /** Approximate 1-based line number (for reference only). */
  lineNumber?: number;
  /** Short label for the kind of flaw, e.g. "blocking-loop". */
  flawType: string;
  /** Human-readable description of the issue. */
  description: string;
  /** Agent Finding.category values that would count as a correct match. */
  expectedCategories: string[];
  /** Expected severity the agent should assign. */
  expectedSeverity: 'critical' | 'warning' | 'info';
  /** Keywords that should appear in a correct finding's title or description. */
  keywords: string[];
}

// ── Reference findings ───────────────────────────────────────

export const REFERENCE_FINDINGS: ReferenceFinding[] = [
  // ─── Blocking (2) ────────────────────────────────────────

  {
    id: 'blocking-hashPassword',
    category: 'blocking',
    sourceFile: 'src/utils/crypto.ts',
    functionName: 'hashPassword',
    lineNumber: 6,
    flawType: 'blocking-loop',
    description:
      'hashPassword() uses a synchronous CPU-intensive loop (10,000 iterations) that blocks the event loop. Should use async Web Crypto API or node:crypto.',
    expectedCategories: ['blocking-io', 'hot-function', 'algorithm', 'long-task'],
    expectedSeverity: 'critical',
    keywords: [
      'hashPassword',
      'blocking',
      'synchronous',
      'event loop',
      'CPU',
      'crypto',
      'loop',
      'iterations',
    ],
  },
  {
    id: 'blocking-generateToken',
    category: 'blocking',
    sourceFile: 'src/utils/crypto.ts',
    functionName: 'generateToken',
    lineNumber: 32,
    flawType: 'blocking-compound',
    description:
      'generateToken() calls hashPassword() internally, compounding the event-loop blocking. Allocates intermediate arrays unnecessarily.',
    expectedCategories: ['blocking-io', 'hot-function', 'algorithm'],
    expectedSeverity: 'critical',
    keywords: ['generateToken', 'hashPassword', 'blocking', 'token', 'synchronous'],
  },

  // ─── Listener Leaks (3) ──────────────────────────────────

  {
    id: 'listener-leak-getAnalytics',
    category: 'listener-leak',
    sourceFile: 'src/services/analytics-service.ts',
    functionName: 'getAnalytics',
    lineNumber: 27,
    flawType: 'listener-accumulation',
    description:
      'getAnalytics() adds a new task:changed listener on every call but never removes old ones. After N calls there are N active listeners.',
    expectedCategories: ['listener-leak', 'event-handling', 'gc-pressure'],
    expectedSeverity: 'critical',
    keywords: [
      'getAnalytics',
      'listener',
      'task:changed',
      'removeListener',
      'leak',
      'accumulation',
      'every call',
    ],
  },
  {
    id: 'listener-leak-subscribe',
    category: 'listener-leak',
    sourceFile: 'src/services/notification-service.ts',
    functionName: 'subscribe',
    lineNumber: 34,
    flawType: 'listener-no-unsubscribe',
    description:
      'subscribe() adds EventEmitter listeners without providing an unsubscribe mechanism. Repeated subscriptions to the same channel pile up.',
    expectedCategories: ['listener-leak', 'event-handling', 'gc-pressure'],
    expectedSeverity: 'warning',
    keywords: [
      'subscribe',
      'listener',
      'notification',
      'unsubscribe',
      'remove',
      'pile up',
      'accumulation',
    ],
  },
  {
    id: 'listener-leak-maxListeners',
    category: 'listener-leak',
    sourceFile: 'src/services/analytics-service.ts',
    functionName: 'getAnalytics',
    lineNumber: 27,
    flawType: 'max-listeners-exceeded',
    description:
      'The task:changed event exceeds the default maxListeners threshold of 10, triggering MaxListenersExceededWarning.',
    expectedCategories: ['listener-leak', 'event-handling'],
    expectedSeverity: 'critical',
    keywords: ['maxListeners', 'threshold', 'exceeded', 'warning', 'task:changed', '10'],
  },

  // ─── Slow Code Paths (5) ─────────────────────────────────

  {
    id: 'slow-computeTagCorrelations',
    category: 'slow-code-path',
    sourceFile: 'src/services/analytics-service.ts',
    functionName: 'computeTagCorrelations',
    lineNumber: 81,
    flawType: 'quadratic-algorithm',
    description:
      'computeTagCorrelations() is O(n² × m²) — compares every pair of tasks and every pair of their tags. Sorts and joins strings in the inner loop.',
    expectedCategories: ['algorithm', 'hot-function', 'unnecessary-computation'],
    expectedSeverity: 'warning',
    keywords: [
      'computeTagCorrelations',
      'O(n',
      'quadratic',
      'pair',
      'tags',
      'correlation',
      'nested loop',
      'sort',
    ],
  },
  {
    id: 'slow-deepClone',
    category: 'slow-code-path',
    sourceFile: 'src/services/task-service.ts',
    functionName: 'getAllTasks',
    lineNumber: 9,
    flawType: 'unnecessary-serialization',
    description:
      'getAllTasks() and getTask() deep-clone the entire result via JSON.parse(JSON.stringify(...)) on every read. A shallow copy or structuredClone would suffice.',
    expectedCategories: ['serialization', 'unnecessary-computation', 'hot-function'],
    expectedSeverity: 'warning',
    keywords: [
      'JSON.parse',
      'JSON.stringify',
      'deep clone',
      'serialize',
      'getAllTasks',
      'getTask',
      'unnecessary',
    ],
  },
  {
    id: 'slow-validateTags-quadratic',
    category: 'slow-code-path',
    sourceFile: 'src/utils/validators.ts',
    functionName: 'validateTags',
    lineNumber: 45,
    flawType: 'quadratic-duplicate-check',
    description:
      'validateTags() uses .filter() over the whole array for each element to detect duplicates, resulting in O(n²) work. A Set-based approach would be O(n).',
    expectedCategories: ['algorithm', 'unnecessary-computation', 'hot-function'],
    expectedSeverity: 'info',
    keywords: ['validateTags', 'duplicate', 'filter', 'O(n', 'quadratic', 'Set'],
  },
  {
    id: 'slow-regex-recompilation',
    category: 'slow-code-path',
    sourceFile: 'src/utils/validators.ts',
    functionName: 'validateTaskTitle',
    lineNumber: 16,
    flawType: 'regex-recompilation',
    description:
      'validateTaskTitle() and validateEmail() compile new RegExp objects on every call instead of reusing module-level constants.',
    expectedCategories: ['allocation', 'unnecessary-computation', 'hot-function'],
    expectedSeverity: 'info',
    keywords: [
      'RegExp',
      'regex',
      'recompil',
      'new RegExp',
      'validateTaskTitle',
      'validateEmail',
      'every call',
      'module-level',
    ],
  },
  {
    id: 'slow-computePriorityWeight',
    category: 'slow-code-path',
    sourceFile: 'src/services/task-service.ts',
    functionName: 'computePriorityWeight',
    lineNumber: 47,
    flawType: 'expensive-sort-comparator',
    description:
      'computePriorityWeight() constructs Date objects and performs string operations on every sort comparison — called O(n log n) times per sort.',
    expectedCategories: ['allocation', 'unnecessary-computation', 'hot-function', 'algorithm'],
    expectedSeverity: 'info',
    keywords: [
      'computePriorityWeight',
      'Date',
      'sort',
      'comparator',
      'every comparison',
      'O(n log n)',
    ],
  },

  // ─── Closure Leaks (3) ───────────────────────────────────

  {
    id: 'closure-cache-refresher',
    category: 'closure-leak',
    sourceFile: 'src/services/cache-service.ts',
    functionName: 'set',
    lineNumber: 28,
    flawType: 'closure-captures-data',
    description:
      'CacheService.set() stores a refresher closure that captures the full value and requestContext from the enclosing scope. Even after the data is stale, the references live on.',
    expectedCategories: ['gc-pressure', 'allocation', 'other'],
    expectedSeverity: 'warning',
    keywords: ['cache', 'closure', 'refresher', 'captures', 'garbage', 'retain', 'scope', 'stale'],
  },
  {
    id: 'closure-cache-accessLog',
    category: 'closure-leak',
    sourceFile: 'src/services/cache-service.ts',
    functionName: 'get',
    lineNumber: 50,
    flawType: 'unbounded-log',
    description:
      'CacheService access logs grow without bounds, retaining full request contexts. No eviction, TTL, or cleanup mechanism exists.',
    expectedCategories: ['gc-pressure', 'allocation', 'other'],
    expectedSeverity: 'warning',
    keywords: [
      'cache',
      'accessLog',
      'unbounded',
      'grows',
      'eviction',
      'TTL',
      'cleanup',
      'without bound',
    ],
  },
  {
    id: 'closure-requestTracker',
    category: 'closure-leak',
    sourceFile: 'src/middleware/request-tracker.ts',
    functionName: 'track',
    lineNumber: 25,
    flawType: 'closure-captures-request',
    description:
      'RequestTracker.track() stores getDetails closures that capture the original request body. Records grow without bound, preventing GC of old request data.',
    expectedCategories: ['gc-pressure', 'allocation', 'other'],
    expectedSeverity: 'warning',
    keywords: [
      'request',
      'tracker',
      'closure',
      'getDetails',
      'captures',
      'body',
      'unbounded',
      'garbage',
    ],
  },

  // ─── Excessive Instantiation (3) ─────────────────────────

  {
    id: 'instantiation-sendNotification',
    category: 'excessive-instantiation',
    sourceFile: 'src/services/notification-service.ts',
    functionName: 'sendNotification',
    lineNumber: 46,
    flawType: 'per-call-object-creation',
    description:
      'sendNotification() creates a new Intl.DateTimeFormat, TextEncoder, and Map on every call — all stateless and safely reusable as module-level singletons.',
    expectedCategories: ['allocation', 'unnecessary-computation', 'hot-function'],
    expectedSeverity: 'info',
    keywords: [
      'sendNotification',
      'Intl.DateTimeFormat',
      'TextEncoder',
      'Map',
      'every call',
      'singleton',
      'reusable',
      'instantiation',
    ],
  },
  {
    id: 'instantiation-hashPassword-encoder',
    category: 'excessive-instantiation',
    sourceFile: 'src/utils/crypto.ts',
    functionName: 'hashPassword',
    lineNumber: 9,
    flawType: 'per-call-encoder',
    description:
      'hashPassword() allocates a new TextEncoder per invocation. TextEncoder is stateless and should be a module-level singleton.',
    expectedCategories: ['allocation', 'unnecessary-computation'],
    expectedSeverity: 'info',
    keywords: ['hashPassword', 'TextEncoder', 'per invocation', 'singleton', 'reusable', 'allocat'],
  },
  {
    id: 'instantiation-validators-regex',
    category: 'excessive-instantiation',
    sourceFile: 'src/utils/validators.ts',
    functionName: 'validateTags',
    lineNumber: 52,
    flawType: 'per-call-regex',
    description:
      'Validators compile RegExp patterns on every function call instead of reusing module-level precompiled constants.',
    expectedCategories: ['allocation', 'unnecessary-computation'],
    expectedSeverity: 'info',
    keywords: [
      'RegExp',
      'regex',
      'compile',
      'every call',
      'module-level',
      'constant',
      'validator',
      'recompil',
    ],
  },
];
