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
Array of:
{
  functionName: string,
  scriptUrl: string,        // URL of the script (maps to scripts/<filename>)
  lineNumber: number,
  columnNumber: number,
  duration: number,         // milliseconds blocked on main thread
  callStack: string[],      // parent function names
  category: string          // "scripting" | "layout" | "paint" | etc.
}

## trace/runtime/event-listeners.json
Array of:
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
  traceDuration: number,
  mainThreadId: number,
  frameBreakdown: { scripting, layout, paint, gc, other },
  blockingFunctionCount: number,
  listenerImbalances: number,
  gcPauseCount: number,
  gcTotalDuration: number,
  frequentEventTypes: string[]
}

## trace/network-waterfall.json
Array of:
{
  url: string,
  type: string,             // "Script" | "Stylesheet" | "Font" | "Document" | "Image"
  status: number,
  size: number,             // decoded size in bytes
  startTime: number,        // ms from navigation start
  endTime: number,
  duration: number,
  isRenderBlocking: boolean,
  priority: string,
  path: string | null       // workspace path to stored content
}

## hot-functions/application.json
Array of:
{
  functionName: string,
  workspacePath: string,    // e.g. "src/services/crypto.ts"
  lineNumber: number,
  columnNumber: number,
  selfTime: number,         // ms of CPU self-time
  totalTime: number,        // ms including callees
  hitCount: number,
  selfPercent: number,      // % of total profile duration
  sourceCategory: "application",
  sourceSnippet?: string,   // source code context around the hot line
  callerChain?: [{ functionName, workspacePath, lineNumber }]
}

## listener-tracking.json
{
  summary: { totalAdds, totalRemoves, activeCount },
  byEventType: [{
    eventType, targetType, addCount, removeCount, activeCount,
    stackSnippets: string[]
  }],
  exceedances: [{
    eventType, targetType, count, threshold, stack: string
  }]
}

## summary.json (Vitest)
{
  totalTests: number,
  totalDuration: number,
  passCount: number,
  failCount: number,
  profileCount: number,
  slowestFile: string | null,
  slowestFileDuration: number,
  totalGcTime: number,
  gcPercentage: number
}

## scripts/application.json
Array of:
{
  workspacePath: string,
  selfTime: number,
  selfPercent: number,
  functionCount: number
}
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
