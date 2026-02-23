/**
 * Workspace builder for Vitest — delegates to the shared implementation
 * in @zeitzeuge/utils. Re-exports for backward compatibility.
 */

import { createTestWorkspace, mergeHotFunctions } from '@zeitzeuge/utils';
import type { TestWorkspaceOptions, TestWorkspaceResult } from '@zeitzeuge/utils';

export type VitestWorkspaceOptions = TestWorkspaceOptions;
export type VitestWorkspaceResult = TestWorkspaceResult;

export const createVitestWorkspace = createTestWorkspace;
export { mergeHotFunctions };
