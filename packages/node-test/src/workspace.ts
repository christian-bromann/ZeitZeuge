/**
 * Workspace builder for Node.js test runner — delegates to the shared
 * vitest workspace builder since the workspace format is identical.
 */
export {
  createVitestWorkspace as createNodeTestWorkspace,
  mergeHotFunctions,
} from '../../vitest/src/workspace.js';
export type { VitestWorkspaceResult as NodeTestWorkspaceResult } from '../../vitest/src/workspace.js';
