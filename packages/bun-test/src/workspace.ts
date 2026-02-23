/**
 * Workspace builder — re-exports from the vitest package since the
 * workspace building logic is shared across all test runner integrations.
 */
export { createVitestWorkspace as createBunTestWorkspace } from '../../vitest/src/workspace.js';
export type { VitestWorkspaceResult as BunTestWorkspaceResult } from '../../vitest/src/workspace.js';
export { mergeHotFunctions } from '@zeitzeuge/utils';
