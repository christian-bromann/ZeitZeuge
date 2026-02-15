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
        </div>
      </div>
    </section>
  );
}
