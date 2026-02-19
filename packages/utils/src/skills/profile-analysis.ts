const SKILL_MD = `---
name: profile-analysis
description: Use this skill when analyzing V8 CPU profiles, hot functions, event listener tracking, and heap allocation data from Vitest test runs. Provides pre-built analysis scripts for common test performance patterns.
---

# Profile Analysis Scripts

## Overview

Pre-built scripts for analyzing Vitest performance data. Run these
directly or use them as templates for custom analysis.

## Available scripts

### Analyze hot functions
execute_command: node skills/profile-analysis/helpers/analyze-hotfunctions.js [--threshold 1]

Reads hot-functions/application.json, groups by file, and outputs:
- Per-file CPU time breakdown
- Hot functions above threshold (default 1% selfPercent)
- Caller chains for compound blocker detection
- Total application vs. GC breakdown

### Analyze listener tracking
execute_command: node skills/profile-analysis/helpers/analyze-listeners.js

Reads listener-tracking.json, outputs:
- Event types with add/remove imbalances
- MaxListeners exceedances with stack traces
- Suggested source files to investigate

### Find closure and leak patterns
execute_command: node skills/profile-analysis/helpers/find-leaks.js

Searches all src/ files for common leak patterns:
- Maps/Sets/Arrays with .set/.push/.add but no .delete/.clear
- Closures stored in long-lived data structures
- .on()/.addEventListener() without corresponding removal
- Unbounded caches without TTL or maxSize

## Writing custom scripts

Read skills/data-scripting/schemas.md for JSON structures.
All source files are under src/ and can be read with fs.readFileSync.
`;

const ANALYZE_HOTFUNCTIONS_JS = `'use strict';

const fs = require('fs');

const args = process.argv.slice(2);
let threshold = 1;
const thresholdIdx = args.indexOf('--threshold');
if (thresholdIdx !== -1 && args[thresholdIdx + 1]) {
  threshold = parseFloat(args[thresholdIdx + 1]);
}

let hotFunctions;
try {
  hotFunctions = JSON.parse(fs.readFileSync('hot-functions/application.json', 'utf8'));
} catch (err) {
  console.error('Could not read hot-functions/application.json:', err.message);
  process.exit(1);
}

if (!Array.isArray(hotFunctions) || hotFunctions.length === 0) {
  console.log('No hot functions found.');
  process.exit(0);
}

let summary = null;
try {
  summary = JSON.parse(fs.readFileSync('summary.json', 'utf8'));
} catch (_) {}

const byFile = new Map();
for (const fn of hotFunctions) {
  const key = fn.workspacePath || '(unknown)';
  if (!byFile.has(key)) byFile.set(key, []);
  byFile.get(key).push(fn);
}

const fileTotals = [];
for (const [filePath, fns] of byFile) {
  const totalSelfTime = fns.reduce((sum, f) => sum + (f.selfTime || 0), 0);
  fileTotals.push({ filePath, totalSelfTime, functions: fns });
}
fileTotals.sort((a, b) => b.totalSelfTime - a.totalSelfTime);

console.log('=== Per-File CPU Breakdown ===\\n');
for (const { filePath, totalSelfTime, functions: fns } of fileTotals) {
  console.log(\`\${filePath}  (total selfTime: \${totalSelfTime.toFixed(2)}ms)\`);
  const sorted = fns.slice().sort((a, b) => (b.selfTime || 0) - (a.selfTime || 0));
  for (const f of sorted) {
    console.log(\`  \${f.functionName || '(anonymous)'}  line \${f.lineNumber || '?'}  selfTime=\${(f.selfTime || 0).toFixed(2)}ms  selfPercent=\${(f.selfPercent || 0).toFixed(2)}%\`);
  }
  console.log();
}

const aboveThreshold = hotFunctions
  .filter(f => (f.selfPercent || 0) >= threshold)
  .sort((a, b) => (b.selfPercent || 0) - (a.selfPercent || 0));

console.log(\`=== Hot Functions Above \${threshold}% Threshold ===\\n\`);
if (aboveThreshold.length === 0) {
  console.log(\`No functions above \${threshold}% selfPercent.\\n\`);
} else {
  for (const f of aboveThreshold) {
    console.log(\`\${f.functionName || '(anonymous)'}  \${f.workspacePath || '?'}:\${f.lineNumber || '?'}\`);
    console.log(\`  selfTime=\${(f.selfTime || 0).toFixed(2)}ms  selfPercent=\${(f.selfPercent || 0).toFixed(2)}%\`);
  }
  console.log();
}

const withCallers = hotFunctions.filter(f => f.callerChain && f.callerChain.length > 0);
if (withCallers.length > 0) {
  console.log('=== Caller Chains ===\\n');
  for (const f of withCallers) {
    console.log(\`\${f.functionName || '(anonymous)'}  \${f.workspacePath || '?'}:\${f.lineNumber || '?'}\`);
    for (const caller of f.callerChain) {
      console.log(\`  <- \${caller.functionName || '(anonymous)'}  \${caller.workspacePath || '?'}:\${caller.lineNumber || '?'}\`);
    }
    console.log();
  }
}

console.log('=== Summary ===\\n');
const totalAppSelfTime = hotFunctions.reduce((sum, f) => sum + (f.selfTime || 0), 0);
console.log(\`Total application selfTime: \${totalAppSelfTime.toFixed(2)}ms\`);
console.log(\`Total hot functions: \${hotFunctions.length}\`);
console.log(\`Functions above threshold: \${aboveThreshold.length}\`);
if (summary) {
  if (summary.totalGcTime != null) console.log(\`GC time: \${summary.totalGcTime.toFixed(2)}ms\`);
  if (summary.gcPercentage != null) console.log(\`GC percentage: \${summary.gcPercentage.toFixed(2)}%\`);
  if (summary.totalDuration != null) console.log(\`Total profile duration: \${summary.totalDuration.toFixed(2)}ms\`);
}
`;

const ANALYZE_LISTENERS_JS = `'use strict';

const fs = require('fs');

let data;
try {
  data = JSON.parse(fs.readFileSync('listener-tracking.json', 'utf8'));
} catch (err) {
  console.log('No listener tracking data available (listener-tracking.json not found or unreadable).');
  process.exit(0);
}

const byEventType = data.byEventType || [];
const exceedances = data.exceedances || [];
const summaryData = data.summary || {};

console.log('=== Listener Tracking Summary ===\\n');
console.log(\`Total adds: \${summaryData.totalAdds || 0}\`);
console.log(\`Total removes: \${summaryData.totalRemoves || 0}\`);
console.log(\`Active listeners: \${summaryData.activeCount || 0}\\n\`);

const imbalances = byEventType.filter(e => e.addCount > (e.removeCount || 0) * 2);
console.log('=== Add/Remove Imbalances ===\\n');
if (imbalances.length === 0) {
  console.log('No significant add/remove imbalances detected.\\n');
} else {
  for (const e of imbalances) {
    console.log(\`\${e.eventType} on \${e.targetType || '(unknown target)'}\`);
    console.log(\`  adds=\${e.addCount}  removes=\${e.removeCount || 0}  active=\${e.activeCount || 0}\`);
  }
  console.log();
}

console.log('=== MaxListeners Exceedances ===\\n');
if (exceedances.length === 0) {
  console.log('No maxListeners exceedances.\\n');
} else {
  for (const e of exceedances) {
    console.log(\`\${e.eventType} on \${e.targetType || '(unknown target)'}  count=\${e.count}  threshold=\${e.threshold}\`);
    if (e.stack) {
      console.log('  Stack trace:');
      for (const line of e.stack.split('\\n').slice(0, 5)) {
        console.log(\`    \${line.trim()}\`);
      }
    }
    console.log();
  }
}

const filePattern = /(?:\\/src\\/[^\\s:)]+|[a-zA-Z0-9_\\-./]+\\.[jt]sx?)/g;
const suggestedFiles = new Set();

for (const e of exceedances) {
  if (e.stack) {
    for (const match of e.stack.matchAll(filePattern)) {
      suggestedFiles.add(match[0]);
    }
  }
}
for (const e of byEventType) {
  if (e.stackSnippets) {
    for (const snippet of e.stackSnippets) {
      for (const match of snippet.matchAll(filePattern)) {
        suggestedFiles.add(match[0]);
      }
    }
  }
}

console.log('=== Suggested Files to Investigate ===\\n');
if (suggestedFiles.size === 0) {
  console.log('No file paths extracted from stack traces.');
} else {
  for (const f of suggestedFiles) {
    console.log(\`  \${f}\`);
  }
}
`;

const FIND_LEAKS_JS = `'use strict';

const fs = require('fs');

function normalizePath(p) {
  return p.startsWith('/') ? p.slice(1) : p;
}

let hotFunctions;
try {
  hotFunctions = JSON.parse(fs.readFileSync('hot-functions/application.json', 'utf8'));
} catch (err) {
  console.error('Could not read hot-functions/application.json:', err.message);
  process.exit(1);
}

const filePaths = [...new Set(hotFunctions.map(f => f.workspacePath).filter(Boolean))];

if (filePaths.length === 0) {
  console.log('No source file paths found in hot-functions data.');
  process.exit(0);
}

const findings = [];

for (const rawPath of filePaths) {
  const filePath = normalizePath(rawPath);
  let content;
  try {
    content = fs.readFileSync(filePath, 'utf8');
  } catch (_) {
    continue;
  }

  const lines = content.split('\\n');
  const hasDelete = content.includes('.delete(') || content.includes('.clear(') || content.includes('.splice(');
  const hasRemoveListener = content.includes('.off(') || content.includes('.removeEventListener(') || content.includes('.removeListener(');

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineNum = i + 1;

    if (/\\.(set|push|add)\\(/.test(line) && !hasDelete) {
      findings.push({ filePath, lineNum, pattern: 'unbounded-collection', line: line.trim() });
    }

    if ((/\\.on\\(/.test(line) || /\\.addEventListener\\(/.test(line)) && !hasRemoveListener) {
      findings.push({ filePath, lineNum, pattern: 'listener-leak', line: line.trim() });
    }

    if (/\\.(set|push)\\(.*(?:=>|function\\s*\\()/.test(line)) {
      findings.push({ filePath, lineNum, pattern: 'closure-capture', line: line.trim() });
    }

    if (/\\b(?:cache|Cache|CACHE|memo|Memo|store|Store)\\b/.test(line)
        && /\\.(set|push|add)\\(/.test(line)
        && !/(?:ttl|TTL|maxSize|maxAge|expire|limit)/i.test(content)) {
      findings.push({ filePath, lineNum, pattern: 'unbounded-cache', line: line.trim() });
    }
  }
}

if (findings.length === 0) {
  console.log('No potential leak patterns found in source files.');
  process.exit(0);
}

console.log(\`Found \${findings.length} potential leak pattern(s):\\n\`);

const grouped = new Map();
for (const f of findings) {
  if (!grouped.has(f.pattern)) grouped.set(f.pattern, []);
  grouped.get(f.pattern).push(f);
}

for (const [pattern, items] of grouped) {
  console.log(\`--- [\${pattern}] ---\\n\`);
  for (const { filePath, lineNum, line } of items) {
    console.log(\`\${filePath}:\${lineNum}: [\${pattern}] \${line}\`);
  }
  console.log();
}
`;

export const PROFILE_ANALYSIS_SKILL_FILES: Record<string, string> = {
  'skills/profile-analysis/SKILL.md': SKILL_MD,
  'skills/profile-analysis/helpers/analyze-hotfunctions.js': ANALYZE_HOTFUNCTIONS_JS,
  'skills/profile-analysis/helpers/analyze-listeners.js': ANALYZE_LISTENERS_JS,
  'skills/profile-analysis/helpers/find-leaks.js': FIND_LEAKS_JS,
};
