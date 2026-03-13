import { createAgent, tool } from 'langchain';
import { z } from 'zod';

const searchTool = tool(({ query }) => `Results for: ${query}`, {
  name: 'search',
  description: 'Search the web for information',
  schema: z.object({
    query: z.string().describe('The search query'),
  }),
});

export const agent = createAgent({
  model: 'openai:gpt-4o',
  tools: [searchTool],
});
