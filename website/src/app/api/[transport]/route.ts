import { createMcpHandler } from 'mcp-handler';
import { z } from 'zod';
import { getDocMetas, getRawMarkdown } from '@/lib/docs';

const handler = createMcpHandler(
  (server) => {
    // Tool: search_docs
    server.registerTool(
      'search_docs',
      {
        title: 'Search Documentation',
        description:
          'Search zeitzeuge documentation. Returns matching doc pages with titles, descriptions, and content.',
        inputSchema: {
          query: z.string().describe('Search query to find in documentation'),
        },
      },
      async ({ query }) => {
        const metas = getDocMetas();
        const results = metas
          .map((m) => {
            const md = getRawMarkdown(m.slug);
            return { ...m, content: md || '' };
          })
          .filter(
            (doc) =>
              doc.title.toLowerCase().includes(query.toLowerCase()) ||
              doc.description.toLowerCase().includes(query.toLowerCase()) ||
              doc.content.toLowerCase().includes(query.toLowerCase()),
          );

        if (results.length === 0) {
          return {
            content: [{ type: 'text' as const, text: `No docs found for "${query}".` }],
          };
        }

        const text = results
          .map((r) => `## ${r.title}\n\n${r.description}\n\n${r.content}`)
          .join('\n\n---\n\n');

        return { content: [{ type: 'text' as const, text }] };
      },
    );

    // Tool: list_docs
    server.registerTool(
      'list_docs',
      {
        title: 'List Documentation Pages',
        description:
          'List all available zeitzeuge documentation pages with titles and descriptions.',
        inputSchema: {},
      },
      async () => {
        const metas = getDocMetas();
        const text = metas
          .map((m) => `- **${m.title}** (/docs/${m.slug}): ${m.description}`)
          .join('\n');
        return { content: [{ type: 'text' as const, text }] };
      },
    );

    // Tool: get_doc
    server.registerTool(
      'get_doc',
      {
        title: 'Get Documentation Page',
        description: 'Get the full Markdown content of a specific documentation page by slug.',
        inputSchema: {
          slug: z.string().describe("Documentation page slug (e.g. 'cli', 'vitest')"),
        },
      },
      async ({ slug }) => {
        const md = getRawMarkdown(slug);
        if (!md) {
          return {
            content: [{ type: 'text' as const, text: `No doc found with slug "${slug}".` }],
          };
        }
        return { content: [{ type: 'text' as const, text: md }] };
      },
    );
  },
  {
    serverInfo: {
      name: 'zeitzeuge-docs',
      version: '1.0.0',
    },
  },
  {
    basePath: '/api',
    maxDuration: 60,
  },
);

export { handler as GET, handler as POST, handler as DELETE };
