import { CodeBlock } from './code-block';

const CLI_CODE = `# Set your API key
export OPENAI_API_KEY=sk-...

# Analyze any URL
npx zeitzeuge http://localhost:3000`;

const VITEST_CODE = `// vitest.config.ts
import { defineConfig } from 'vitest/config';
import { zeitzeuge } from '@zeitzeuge/vitest';

export default defineConfig({
  plugins: [zeitzeuge()],
});`;

const NODE_TEST_CODE = `# Run with CPU profiling + zeitzeuge reporter
node --test \\
  --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \\
  --test-reporter @zeitzeuge/node-test/reporter \\
  --test-reporter-destination stdout \\
  tests/*.test.js`;

const BUN_TEST_CODE = `// scripts/profile-tests.ts
import { analyzeTestRun } from '@zeitzeuge/bun-test';

await Bun.$\`bun test\`;
await analyzeTestRun();`;

export async function QuickStart() {
  return (
    <section className="py-20 sm:py-24 bg-surface-alt">
      <div className="max-w-5xl mx-auto px-4 sm:px-6">
        <h2 className="text-3xl font-bold text-center mb-12 text-foreground">Quick Start</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
              CLI
            </h3>
            <CodeBlock code={CLI_CODE} language="bash" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
              Vitest
            </h3>
            <CodeBlock code={VITEST_CODE} language="typescript" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
              Node.js Test Runner
            </h3>
            <CodeBlock code={NODE_TEST_CODE} language="bash" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-text-muted uppercase tracking-wider mb-3">
              Bun
            </h3>
            <CodeBlock code={BUN_TEST_CODE} language="typescript" />
          </div>
        </div>
      </div>
    </section>
  );
}
