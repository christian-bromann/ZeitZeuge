/**
 * Workspace builder — re-exports from the vitest package since the
 * workspace building logic (createVitestWorkspace) is complex and
 * tightly coupled to the VFS layout. It operates entirely on shared
 * types from @zeitzeuge/utils.
 */
export { createVitestWorkspace as createNodeTestWorkspace } from '../../vitest/src/workspace.js';
export type { VitestWorkspaceResult as NodeTestWorkspaceResult } from '../../vitest/src/workspace.js';
export { mergeHotFunctions } from '@zeitzeuge/utils';
