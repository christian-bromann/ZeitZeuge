import { workspaceBuildPlugin, checkWorkspaceDeps } from '../build-helpers.ts';

const pkg = await Bun.file('./package.json').json();
await checkWorkspaceDeps(pkg);

const start = performance.now();
const result = await Bun.build({
  entrypoints: ['src/index.ts', 'src/reporter.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [workspaceBuildPlugin(import.meta.dir)],
});

const end = performance.now();
console.log(`Build time: ${Math.round(end - start)}ms for ${pkg.name}@${pkg.version}`);

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
