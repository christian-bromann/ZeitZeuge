import { resolve } from 'node:path';

const pkg = await Bun.file('./package.json').json();
const start = performance.now();
const result = await Bun.build({
  entrypoints: ['src/index.ts', 'src/reporter.ts'],
  outdir: 'dist',
  target: 'node',
  format: 'esm',
  packages: 'external',
  plugins: [
    {
      name: 'bundle-workspace',
      setup(build) {
        build.onResolve({ filter: /^@zeitzeuge\// }, (args) => ({
          path: resolve(import.meta.dir, `../${args.path.replace('@zeitzeuge/', '')}/src/index.ts`),
        }));
      },
    },
  ],
});

const end = performance.now();
console.log(`Build time: ${Math.round(end - start)}ms for ${pkg.name}@${pkg.version}`);

if (!result.success) {
  for (const log of result.logs) {
    console.error(log);
  }
  process.exit(1);
}
