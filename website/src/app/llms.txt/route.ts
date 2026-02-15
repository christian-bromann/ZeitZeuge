import { NextResponse } from 'next/server';
import { getDocMetas } from '@/lib/docs';

export async function GET() {
  const metas = getDocMetas();

  const sections = metas
    .map((m) => `- [${m.title}](https://zeitzeuge.dev/docs/${m.slug}): ${m.description}`)
    .join('\n');

  const body = `# zeitzeuge

> AI-powered performance analysis for frontend page loads and Vitest test suites

zeitzeuge captures V8 heap snapshots, Chrome runtime traces, and CPU profiles — then hands them to a LangChain Deep Agent that autonomously finds bottlenecks and suggests code-level fixes.

## Docs

${sections}

## Links

- [GitHub](https://github.com/christian-bromann/zeitzeuge)
- [npm: zeitzeuge](https://www.npmjs.com/package/zeitzeuge)
- [npm: @zeitzeuge/vitest](https://www.npmjs.com/package/@zeitzeuge/vitest)
`;

  return new NextResponse(body, {
    headers: {
      'Content-Type': 'text/markdown; charset=utf-8',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}
