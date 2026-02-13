#!/usr/bin/env node
/**
 * Runner script — exercises the data-processing module so that
 * `node --cpu-prof --cpu-prof-dir=<dir> runner.mjs`
 * produces a .cpuprofile capturing realistic application work.
 *
 * Each function is called with parameters calibrated to consume
 * enough CPU time (50–200ms each) to reliably appear in the
 * V8 CPU profiler's sampling output.
 */

import {
  buildUserIndex,
  setupMetricsCollector,
  computeCorrelationMatrix,
  deduplicateRecords,
  normalizePayload,
} from "./src/data-processing.mjs";

// Keep references to prevent dead-code elimination
const results = {};

results.index = buildUserIndex(50_000);
results.listenerCount = setupMetricsCollector(2_000);
results.correlation = computeCorrelationMatrix(2_500);

const inputArr = Array.from({ length: 4_000 }, (_, i) => i % 200);
results.deduped = deduplicateRecords(inputArr);

results.normalized = normalizePayload(3_000);

// Print a summary so the process doesn't get optimized away
console.log(
  JSON.stringify({
    indexSize: results.index.length,
    listenerCount: results.listenerCount,
    correlation: typeof results.correlation,
    dedupedCount: results.deduped.length,
    normalizedIteration: results.normalized.iteration,
  })
);
