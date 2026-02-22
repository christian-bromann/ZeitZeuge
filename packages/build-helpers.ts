import { resolve } from 'node:path';
import type { BunPlugin } from 'bun';

const PACKAGES_DIR = import.meta.dir;

/**
 * Bun build plugin that inlines `@zeitzeuge/*` workspace packages
 * by resolving their imports to the TypeScript source.
 */
export function workspaceBuildPlugin(callerDir: string): BunPlugin {
  return {
    name: 'bundle-workspace',
    setup(build) {
      build.onResolve({ filter: /^@zeitzeuge\// }, (args) => ({
        path: resolve(callerDir, `../${args.path.replace('@zeitzeuge/', '')}/src/index.ts`),
      }));
    },
  };
}

/**
 * Validates that every dependency of every `@zeitzeuge/*` workspace
 * package referenced by `pkg` is also listed in `pkg.dependencies` or
 * `pkg.peerDependencies`.
 *
 * Because workspace packages are inlined at build time (their code is
 * bundled but their npm imports stay external via `packages: 'external'`),
 * the consuming package must carry those dependencies in its own
 * package.json so they are installed at runtime.
 *
 * Exits with code 1 and a helpful message when dependencies are missing.
 */
export async function checkWorkspaceDeps(pkg: Record<string, any>) {
  const ownDeps = new Set([
    ...Object.keys(pkg.dependencies ?? {}),
    ...Object.keys(pkg.peerDependencies ?? {}),
  ]);

  const workspaceRefs = Object.keys(pkg.devDependencies ?? {}).filter((d) =>
    d.startsWith('@zeitzeuge/'),
  );

  const missing: { consumer: string; dep: string; workspace: string }[] = [];

  for (const ref of workspaceRefs) {
    const wsName = ref.replace('@zeitzeuge/', '');
    const wsPath = resolve(PACKAGES_DIR, wsName, 'package.json');
    const wsPkg = await Bun.file(wsPath).json();

    for (const dep of Object.keys(wsPkg.dependencies ?? {})) {
      if (!ownDeps.has(dep)) {
        missing.push({ consumer: pkg.name, dep, workspace: ref });
      }
    }
  }

  if (missing.length > 0) {
    const grouped = new Map<string, string[]>();
    for (const { dep, workspace } of missing) {
      const list = grouped.get(workspace) ?? [];
      list.push(dep);
      grouped.set(workspace, list);
    }

    console.error(
      `\n✗ ${pkg.name}: missing dependencies that are required by inlined workspace packages:\n`,
    );
    for (const [ws, deps] of grouped) {
      console.error(`  From ${ws}:`);
      for (const dep of deps) {
        console.error(`    - ${dep}`);
      }
    }
    console.error(
      `\nAdd the missing packages to "dependencies" or "peerDependencies" in ${pkg.name}/package.json.\n`,
    );
    process.exit(1);
  }
}
