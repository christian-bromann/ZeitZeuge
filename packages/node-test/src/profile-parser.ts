/**
 * V8 CPU profile parser — re-exports the implementation from @zeitzeuge/vitest.
 *
 * The profile format is identical regardless of which test runner produced it,
 * since all runners use the same V8 engine's --cpu-prof output.
 */
export { parseCpuProfile } from '../../vitest/src/profile-parser.js';
