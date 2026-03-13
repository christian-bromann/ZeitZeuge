import { createDeepAgent } from 'deepagents';

export const agent = createDeepAgent({
  model: 'anthropic:claude-sonnet-4-5-20250929',
});
