/**
 * No Hallucination evaluator for CLI evals (deterministic).
 *
 * The CLI agent works with captured browser data stored in a VFS
 * workspace. Findings reference workspace paths (/scripts/App.tsx),
 * temp sandbox paths (/tmp/vfs-exec-XXX/scripts/App.tsx), or
 * localhost URLs (http://localhost:5199/src/components/App.tsx).
 *
 * A finding is considered valid if its source reference looks like
 * a real workspace path, a known file basename from the fixture site,
 * or a localhost URL. It's hallucinated only if the reference points
 * to a completely made-up file that doesn't exist anywhere.
 */

import type { Finding } from '@zeitzeuge/utils';

const KNOWN_BASENAMES = new Set([
  'index.html',
  'index',
  'main.tsx',
  'App.tsx',
  'Dashboard.tsx',
  'ItemList.tsx',
  'SearchBar.tsx',
  'heavy-init.ts',
  'analytics-blocking.js',
  'viewport-calibration.js',
  'reset.css',
  'theme.css',
  'layout.css',
  'fonts.css',
  'above-fold-hero.css',
]);

const WORKSPACE_PREFIXES = [
  '/scripts/',
  '/styles/',
  '/html/',
  '/heap/',
  '/trace/',
  '/fonts/',
  '/other/',
  '/findings/',
];

/**
 * Workspace directory names without leading slash — agents sometimes
 * omit the leading `/` when referencing workspace files.
 */
const WORKSPACE_DIR_NAMES = WORKSPACE_PREFIXES.map((p) => p.slice(1));

function isValidReference(path: string): boolean {
  if (!path) return false;

  // Workspace VFS paths with leading slash (e.g. /scripts/App.tsx)
  if (WORKSPACE_PREFIXES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  // Workspace VFS paths without leading slash (e.g. scripts/App.tsx)
  if (WORKSPACE_DIR_NAMES.some((prefix) => path.startsWith(prefix))) {
    return true;
  }

  // Temp/sandbox paths containing any workspace prefix
  if (WORKSPACE_PREFIXES.some((prefix) => path.includes(prefix))) {
    return true;
  }

  // Localhost or data URLs from the fixture site
  if (path.startsWith('http://localhost:') || path.startsWith('https://localhost:')) {
    return true;
  }
  if (path.startsWith('data:')) {
    return true;
  }

  // Absolute temp paths from the sandbox exec environment
  if (path.startsWith('/tmp/')) {
    return true;
  }

  // Check if basename matches a known fixture site file
  const basename = path.split('/').pop() ?? '';
  if (KNOWN_BASENAMES.has(basename)) {
    return true;
  }

  // Paths with a directory component and a web source extension are
  // likely real file references (e.g. src/utils/foo.ts, node_modules/x.js)
  if (path.includes('/') && /\.(tsx?|jsx?|css|html|mjs|cjs|json)$/.test(basename)) {
    return true;
  }

  // Vite internal paths and dependency paths
  if (
    path.startsWith('@vite/') ||
    path.startsWith('@react-refresh') ||
    path.includes('node_modules/')
  ) {
    return true;
  }

  return false;
}

export function computeHallucinationRate(findings: Finding[]): Record<string, number> {
  if (findings.length === 0) {
    return {
      hallucination_rate: 0,
      source_reference_accuracy: 1,
    };
  }

  let validReferences = 0;
  let hallucinatedFindings = 0;

  for (const finding of findings) {
    const ref = finding.sourceFile ?? finding.workspacePath ?? finding.resourceUrl;

    if (ref) {
      if (isValidReference(ref)) {
        validReferences++;
      } else {
        hallucinatedFindings++;
      }
    }
    // Findings without any source reference are not counted as hallucinations
  }

  const totalWithRef = validReferences + hallucinatedFindings;

  return {
    hallucination_rate: findings.length > 0 ? hallucinatedFindings / findings.length : 0,
    source_reference_accuracy: totalWithRef > 0 ? validReferences / totalWithRef : 1,
  };
}
