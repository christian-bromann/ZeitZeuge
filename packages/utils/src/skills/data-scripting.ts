const SKILL_MD = `---
name: data-scripting
description: Use this skill when you need to analyze JSON data files in the workspace. Provides instructions for writing Node.js scripts to query, filter, aggregate, and cross-reference data files instead of reading them raw. Includes helper scripts and data file schemas.
---

# Data Scripting

## Overview

You have a full Node.js runtime available via execute_command. Instead of
reading large JSON data files with read_file (which consumes many tokens),
write short scripts that extract exactly what you need.

## When to use scripts vs. read_file

- **read_file**: Source code files you need to see verbatim for
  beforeCode/afterCode, or small files (<50 lines)
- **Scripts**: JSON data files, any file >100 lines, cross-referencing
  multiple files, computing aggregations, filtering by thresholds

## How to run a script

IMPORTANT: All file paths in scripts must use relative paths (no leading
\`/\`). The execute_command tool runs with the workspace as the current
directory, so \`fs.readFileSync('hot-functions/application.json')\` resolves
to \`<workspace>/hot-functions/application.json\`.

Option 1 — inline:
execute_command: node -e "
  const data = JSON.parse(require('fs').readFileSync('path/to/file', 'utf8'));
  const results = data.filter(x => x.duration > 100);
  console.log(JSON.stringify(results, null, 2));
"

Option 2 — use a pre-built helper:
execute_command: node skills/data-scripting/helpers/top-items.js hot-functions/application.json selfTime 10

Option 3 — write a custom script:
write_file: tmp/my-analysis.js
execute_command: node tmp/my-analysis.js

## Pre-built helper scripts

### skills/data-scripting/helpers/top-items.js
Usage: \`node top-items.js <file> <sortField> [limit]\`
Reads a JSON array, sorts by the given field descending, prints top N items.

### skills/data-scripting/helpers/cross-reference.js
Usage: \`node cross-reference.js <file1> <field1> <file2> <field2>\`
Finds items in file1 whose field1 value also appears as field2 in file2.

## Data file schemas

See skills/data-scripting/schemas.md for the JSON structure of every
data file in this workspace. Read it before writing custom scripts.
`;

const SCHEMAS_MD = `# Workspace Data File Schemas

---
# Workspace files
---

## summary.json
{
  totalTests: number,
  totalDuration: number,       // ms
  passCount: number,
  failCount: number,
  profileCount: number,
  slowestFile: string | null,  // file:// URL
  slowestFileDuration: number,
  totalGcTime: number,
  gcPercentage: number
}

## hot-functions/application.json
Array of application-code hot functions (filtered to sourceCategory "application"):
{
  functionName: string,
  workspacePath: string,       // e.g. "/src/services/crypto.ts" (has leading /)
  lineNumber: number,
  columnNumber: number,
  selfTime: number,            // ms of CPU self-time
  totalTime: number,           // ms including callees
  hitCount: number,
  selfPercent: number,         // % of total profile duration
  sourceCategory: "application",
  sourceSnippet?: string,      // source code context around the hot line
  callerChain?: [{ functionName, workspacePath, lineNumber }]
}

## hot-functions/dependencies.json
Same structure as hot-functions/application.json but sourceCategory "dependency".

## hot-functions/global.json
All hot functions across all categories (application, dependency, framework, unknown).
Same item structure. Can be very large (2000+ lines).

## scripts/application.json
Per-script summary for application code:
[{ workspacePath: string, selfTime: number, selfPercent: number, functionCount: number }]

## scripts/dependencies.json
Same structure as scripts/application.json but for dependency scripts.

## src/index.json
Maps source file paths to their hot functions. Key = workspacePath, value = array:
{
  "/src/services/notification-service.ts": [
    { functionName: string, lineNumber: number, selfTime: number, selfPercent: number }
  ],
  "/src/utils/crypto.ts": [...]
}
Use this to know WHICH source files have CPU-hot functions.

## listener-tracking.json
{
  eventTargetCounts: {},       // browser EventTarget counts (usually empty in Node)
  emitterCounts: {             // keyed by event name
    "<eventName>": { addCount: number, removeCount: number },
    ...
  },
  exceedances: [{              // maxListeners threshold exceeded
    targetType: string,        // e.g. "EventEmitter"
    eventType: string,         // e.g. "task:changed"
    listenerCount: number,     // current count that exceeded threshold
    threshold: number,         // the maxListeners value (default 10)
    stack: string              // stack trace showing where listener was added
  }]
}

## metrics/current.json
Comprehensive pre-computed metrics (large file):
{
  version: number,
  timestamp: string,
  suite: { totalDuration, totalTests, passCount, failCount, averageTestDuration,
           medianTestDuration, p95TestDuration, slowestTestDuration, slowestTestName },
  cpu: { gcPercentage, gcTime, idlePercentage, idleTime, applicationTime,
         applicationPercent, dependencyTime, dependencyPercent, testFrameworkTime,
         testFrameworkPercent },
  files: { "<file:// URL>": { duration, testCount, setupTime, gcPercentage } },
  tests: { "<file::testName>": { duration, status } },
  hotFunctions: [{ key, functionName, scriptUrl, lineNumber, selfTime, selfPercent,
                   sourceCategory }],
  listenerTracking: { eventTargetCounts, emitterCounts, exceedances }
}

## timing/overview.json
Array of per-file timing data:
[{
  file: string,                // file:// URL
  duration: number,
  testCount: number,
  passCount: number,
  failCount: number,
  setupTime: number,
  tests: [{ name: string, duration: number, status: string }]
}]

## timing/slow-tests.json
Array of slow tests sorted by duration descending:
[{ file: string, name: string, duration: number }]

## profiles/index.json
Manifest mapping test files to their CPU profile paths:
[{ testFile: string, profilePath: string }]

## profiles/<file>.json
Per-test-file profile summary:
{
  profilePath: string,
  duration: number,
  sampleCount: number,
  hotFunctions: [{
    functionName, lineNumber, columnNumber, selfTime, totalTime,
    hitCount, selfPercent, callerChain, sourceCategory, workspacePath
  }]
}

---
# Browser workspace files (CLI agent only — not present in Vitest workspaces)
---

## heap/summary.json
{
  metadata: { url, capturedAt, totalSize, nodeCount, edgeCount },
  largestObjects: [{ name, type, selfSize, retainedSize, retainerPath: string[] }],
  typeStats: [{ type, count, totalSize, avgSize }],
  constructorStats: [{ constructor, count, totalSize, avgSize }],
  detachedNodes: { count, totalSize, examples: [{ name, retainerPath }] },
  closureStats: { count, totalSize, topClosures: [{ name, contextSize, retainerPath }] }
}

## trace/summary.json
{
  url: string,
  timing: { loadComplete, firstContentfulPaint, largestContentfulPaint, totalBlockingTime, longTasks: [...] },
  requestCount: number,
  totalTransferSize: number,
  totalDecodedSize: number,
  renderBlockingResources: [{ url, type, size, duration, path }],
  resourceBreakdown: { scripts: { count, totalSize }, stylesheets: {...}, fonts: {...}, images: {...}, other: {...} }
}

## trace/runtime/blocking-functions.json
Array of (up to 50 entries, sorted by duration descending):
{
  functionName: string,
  scriptUrl: string,           // URL of the script
  lineNumber: number,
  columnNumber: number,
  duration: number,            // ms blocked on main thread
  startTime: number,           // ms relative to navigation start
  callStack: [{                // caller chain (array of objects, NOT strings)
    functionName: string,
    scriptUrl: string,
    lineNumber: number
  }],
  category: string             // "scripting" | "layout" | "paint" | etc.
}
To get the workspace file path for a scriptUrl, extract the filename:
  e.g. "https://example.com/static/abc123.js" -> "scripts/abc123.js"

## trace/runtime/event-listeners.json
Array of (only listeners with addCount > 0):
{
  eventType: string,
  targetType: string,
  addCount: number,
  removeCount: number,
  activeCount: number,
  stackSnippets: string[]
}

## trace/runtime/summary.json
{
  totalEvents: number,
  traceDuration: number,       // ms
  mainThreadId: number,
  frameBreakdown: { scripting, layout, paint, gc, other },  // all in ms
  blockingFunctionCount: number,
  listenerImbalances: number,
  gcPauseCount: number,
  gcTotalDuration: number,     // ms
  frequentEventTypes: string[] // event types dispatched >10 times
}

## trace/runtime/frame-breakdown.json
{
  scripting: number,           // ms spent in script execution
  layout: number,              // ms spent in layout calculations
  paint: number,               // ms spent painting
  gc: number,                  // ms spent in garbage collection
  other: number                // ms spent in other tasks
}

## trace/network-waterfall.json
Array of (sorted by startTime):
{
  url: string,
  type: string,                // "Script" | "Stylesheet" | "Font" | "Document" | "Image"
  status: number,
  size: number,                // decoded size in bytes
  startTime: number,           // ms from navigation start
  endTime: number,
  duration: number,
  isRenderBlocking: boolean,
  priority: string,
  path: string | null          // workspace path to stored content (e.g. "/scripts/abc.js")
}

## trace/asset-manifest.json
Array of all network assets:
{
  url: string,
  type: string,
  size: number,                // decoded size in bytes
  duration: number,
  isRenderBlocking: boolean,
  stored: boolean,             // true if content was captured and stored
  path: string | null          // workspace path if stored
}

## trace/runtime/raw-events.json
Array of raw Chrome trace events (can be very large). Each entry has:
{
  name: string,                // event name (e.g. "FunctionCall", "Layout", "GCEvent")
  cat: string,                 // category
  ph: string,                  // phase ("X" = complete, "B"/"E" = begin/end)
  ts: number,                  // timestamp in microseconds
  dur: number,                 // duration in microseconds
  tid: number,                 // thread ID
  pid: number,                 // process ID
  args: object                 // event-specific arguments
}
Only use for deep investigation — prefer the summary files first.
`;

const TOP_ITEMS_JS = `'use strict';

const fs = require('fs');

const [filePath, sortField, limitArg] = process.argv.slice(2);
if (!filePath || !sortField) {
  console.error('Usage: node top-items.js <file> <sortField> [limit]');
  process.exit(1);
}

const limit = parseInt(limitArg, 10) || 10;

let raw;
try {
  raw = fs.readFileSync(filePath, 'utf8');
} catch (err) {
  console.error(\`Error reading \${filePath}: \${err.message}\`);
  process.exit(1);
}

let data;
try {
  data = JSON.parse(raw);
} catch (err) {
  console.error(\`Error parsing JSON from \${filePath}: \${err.message}\`);
  process.exit(1);
}

if (!Array.isArray(data)) {
  console.error(\`Expected a JSON array in \${filePath}, got \${typeof data}\`);
  process.exit(1);
}

if (data.length > 0 && !(sortField in data[0])) {
  console.error(\`Field "\${sortField}" not found in items. Available fields: \${Object.keys(data[0]).join(', ')}\`);
  process.exit(1);
}

const sorted = data
  .slice()
  .sort((a, b) => (Number(b[sortField]) || 0) - (Number(a[sortField]) || 0))
  .slice(0, limit);

console.log(JSON.stringify(sorted, null, 2));
`;

const CROSS_REFERENCE_JS = `'use strict';

const fs = require('fs');

const [file1Path, field1, file2Path, field2] = process.argv.slice(2);
if (!file1Path || !field1 || !file2Path || !field2) {
  console.error('Usage: node cross-reference.js <file1> <field1> <file2> <field2>');
  process.exit(1);
}

function readJsonArray(filePath) {
  let raw;
  try {
    raw = fs.readFileSync(filePath, 'utf8');
  } catch (err) {
    console.error(\`Error reading \${filePath}: \${err.message}\`);
    process.exit(1);
  }
  let data;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    console.error(\`Error parsing JSON from \${filePath}: \${err.message}\`);
    process.exit(1);
  }
  if (!Array.isArray(data)) {
    console.error(\`Expected a JSON array in \${filePath}, got \${typeof data}\`);
    process.exit(1);
  }
  return data;
}

const data1 = readJsonArray(file1Path);
const data2 = readJsonArray(file2Path);

const lookupValues = new Set(data2.map(item => item[field2]));
const matches = data1.filter(item => lookupValues.has(item[field1]));

if (matches.length === 0) {
  console.log(\`No items in \${file1Path} have \${field1} matching \${field2} values from \${file2Path}.\`);
  process.exit(0);
}

console.log(\`Found \${matches.length} item(s) in \${file1Path} where \${field1} matches \${field2} in \${file2Path}:\\n\`);
for (const item of matches) {
  console.log(\`  [\${field1}=\${JSON.stringify(item[field1])}]\`);
  console.log(JSON.stringify(item, null, 2));
  console.log();
}
`;

export const DATA_SCRIPTING_SKILL_FILES: Record<string, string> = {
  'skills/data-scripting/SKILL.md': SKILL_MD,
  'skills/data-scripting/schemas.md': SCHEMAS_MD,
  'skills/data-scripting/helpers/top-items.js': TOP_ITEMS_JS,
  'skills/data-scripting/helpers/cross-reference.js': CROSS_REFERENCE_JS,
};
