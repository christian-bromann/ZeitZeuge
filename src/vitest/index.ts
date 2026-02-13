/**
 * Public entry point for the zeitzeuge Vitest integration.
 *
 * Usage in vitest.config.ts:
 *
 * ```ts
 * import { defineConfig } from 'vitest/config'
 * import { zeitzeuge } from 'zeitzeuge/vitest'
 *
 * export default defineConfig({
 *   plugins: [zeitzeuge()],
 * })
 * ```
 */

export { zeitzeuge } from "./plugin.js";
export type { ZeitZeugeVitestOptions, SourceCategory } from "./types.js";
