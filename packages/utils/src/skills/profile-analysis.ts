const SKILL_MD = `---
name: profile-analysis
description: Use this skill when analyzing V8 CPU profiles, hot functions, event listener tracking, and heap allocation data from Vitest test runs. Provides pre-built analysis scripts for common test performance patterns.
---

# Profile Analysis Scripts

## Overview

Pre-built scripts for analyzing Vitest performance data. Run these
directly or use them as templates for custom analysis.

## START HERE — Workspace overview

Run this FIRST to get a prioritized summary of the workspace:

execute_command: node skills/profile-analysis/helpers/analyze-workspace.js

Reads summary.json, src/index.json, hot-functions/application.json,
listener-tracking.json exceedances, and timing/slow-tests.json. Outputs:
- Suite stats (test count, duration, GC)
- Which source files have hot functions (from src/index.json)
- Application hot functions with source snippets
- Listener exceedances and imbalances
- Slow tests
- Full list of source and test files

Use this output to decide which source files to read with read_file.

## Additional scripts

### Analyze hot functions (detailed)
execute_command: node skills/profile-analysis/helpers/analyze-hotfunctions.js [--threshold 1]

Reads hot-functions/application.json, groups by file, and outputs:
- Per-file CPU time breakdown
- Hot functions above threshold (default 1% selfPercent)
- Caller chains for compound blocker detection

### Analyze listener tracking (detailed)
execute_command: node skills/profile-analysis/helpers/analyze-listeners.js

Reads listener-tracking.json (emitterCounts + exceedances), outputs:
- Per-event add/remove counts
- Events with adds but zero removes (leak candidates)
- MaxListeners exceedances with stack traces and listener counts
- Suggested source files to investigate

### Find closure and leak patterns
execute_command: node skills/profile-analysis/helpers/find-leaks.js

Searches all src/ files for common leak patterns:
- Maps/Sets/Arrays with .set/.push/.add but no .delete/.clear
- Closures stored in long-lived data structures
- .on()/.addEventListener() without corresponding removal
- Unbounded caches without TTL or maxSize

## Key data files

- src/index.json — maps source files to their hot functions (READ THIS FIRST)
- hot-functions/application.json — application hot functions with source snippets
- listener-tracking.json — emitterCounts and exceedances
- metrics/current.json — comprehensive aggregate metrics (large)
- profiles/<file>.json — per-test-file profile summaries

## Writing custom scripts

Read skills/data-scripting/schemas.md for JSON structures.
All source files are under src/ and test files under tests/.
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

var emitterCounts = data.emitterCounts || {};
var eventTargetCounts = data.eventTargetCounts || {};
var exceedances = data.exceedances || [];

var totalAdds = 0, totalRemoves = 0;
var entries = Object.entries(emitterCounts);
for (var i = 0; i < entries.length; i++) {
  totalAdds += entries[i][1].addCount || 0;
  totalRemoves += entries[i][1].removeCount || 0;
}

console.log('=== Listener Tracking Summary ===\\n');
console.log('Total adds: ' + totalAdds);
console.log('Total removes: ' + totalRemoves);
console.log('Net active (adds - removes): ' + (totalAdds - totalRemoves) + '\\n');

console.log('=== Per-Event Breakdown ===\\n');
var sorted = entries.slice().sort(function (a, b) {
  return (b[1].addCount || 0) - (a[1].addCount || 0);
});
for (var i = 0; i < sorted.length; i++) {
  var name = sorted[i][0];
  var info = sorted[i][1];
  var net = (info.addCount || 0) - (info.removeCount || 0);
  console.log('  ' + name + '  adds=' + (info.addCount || 0) + '  removes=' + (info.removeCount || 0) + '  net=' + net);
}
console.log();

var imbalances = entries.filter(function (e) {
  return (e[1].addCount || 0) > 0 && (e[1].removeCount || 0) === 0;
});
console.log('=== Add/Remove Imbalances (adds > 0 with zero removes) ===\\n');
if (imbalances.length === 0) {
  console.log('No significant add/remove imbalances detected.\\n');
} else {
  for (var i = 0; i < imbalances.length; i++) {
    var name = imbalances[i][0];
    var info = imbalances[i][1];
    console.log('  ' + name + '  adds=' + (info.addCount || 0) + '  removes=0  *** LEAK CANDIDATE ***');
  }
  console.log();
}

console.log('=== MaxListeners Exceedances ===\\n');
if (exceedances.length === 0) {
  console.log('No maxListeners exceedances.\\n');
} else {
  for (var i = 0; i < exceedances.length; i++) {
    var e = exceedances[i];
    console.log(e.eventType + ' on ' + (e.targetType || '(unknown)') + '  listenerCount=' + e.listenerCount + '  threshold=' + e.threshold);
    if (e.stack) {
      console.log('  Stack trace:');
      var lines = e.stack.split('\\n').slice(0, 5);
      for (var j = 0; j < lines.length; j++) {
        console.log('    ' + lines[j].trim());
      }
    }
    console.log();
  }
}

var filePattern = /(?:src\\/[^\\s:)]+|[a-zA-Z0-9_\\-./]+\\.[jt]sx?)/g;
var suggestedFiles = {};

for (var i = 0; i < exceedances.length; i++) {
  if (exceedances[i].stack) {
    var matches = exceedances[i].stack.match(filePattern);
    if (matches) {
      for (var j = 0; j < matches.length; j++) suggestedFiles[matches[j]] = true;
    }
  }
}

var fileList = Object.keys(suggestedFiles);
console.log('=== Suggested Files to Investigate ===\\n');
if (fileList.length === 0) {
  console.log('No file paths extracted from stack traces.');
} else {
  for (var i = 0; i < fileList.length; i++) {
    console.log('  ' + fileList[i]);
  }
}
`;

const ANALYZE_WORKSPACE_JS = `'use strict';

var fs = require('fs');

function tryRead(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (_) { return null; }
}

var summary = tryRead('summary.json');
var srcIndex = tryRead('src/index.json');
var hotApp = tryRead('hot-functions/application.json');
var listeners = tryRead('listener-tracking.json');
var slowTests = tryRead('timing/slow-tests.json');

console.log('=== Workspace Overview ===\\n');

if (summary) {
  console.log('Suite: ' + summary.totalTests + ' tests, ' + summary.totalDuration + 'ms total');
  console.log('Pass: ' + summary.passCount + '  Fail: ' + summary.failCount);
  if (summary.totalGcTime != null) console.log('GC: ' + summary.totalGcTime.toFixed(1) + 'ms (' + (summary.gcPercentage || 0).toFixed(2) + '%)');
  console.log();
}

console.log('=== Source Files with Hot Functions (src/index.json) ===\\n');
if (srcIndex && typeof srcIndex === 'object') {
  var files = Object.keys(srcIndex);
  if (files.length === 0) {
    console.log('No application source files have hot functions.\\n');
  } else {
    for (var i = 0; i < files.length; i++) {
      var fns = srcIndex[files[i]];
      if (Array.isArray(fns) && fns.length > 0) {
        var names = fns.map(function (f) { return f.functionName + ' (' + (f.selfTime || 0).toFixed(1) + 'ms, ' + (f.selfPercent || 0).toFixed(1) + '%)'; });
        console.log('  ' + files[i]);
        for (var j = 0; j < names.length; j++) console.log('    -> ' + names[j]);
      } else {
        console.log('  ' + files[i] + '  (no hot functions)');
      }
    }
    console.log();
  }
} else {
  console.log('src/index.json not available.\\n');
}

console.log('=== Application Hot Functions ===\\n');
if (Array.isArray(hotApp) && hotApp.length > 0) {
  hotApp.sort(function (a, b) { return (b.selfTime || 0) - (a.selfTime || 0); });
  for (var i = 0; i < hotApp.length; i++) {
    var f = hotApp[i];
    console.log('  ' + (f.functionName || '(anon)') + '  ' + (f.workspacePath || '?') + ':' + (f.lineNumber || '?'));
    console.log('    selfTime=' + (f.selfTime || 0).toFixed(2) + 'ms  selfPercent=' + (f.selfPercent || 0).toFixed(2) + '%');
    if (f.sourceSnippet) {
      var snipLines = f.sourceSnippet.split('\\n').slice(0, 4);
      for (var j = 0; j < snipLines.length; j++) console.log('    | ' + snipLines[j]);
    }
  }
  console.log();
} else {
  console.log('No application hot functions found.\\n');
}

console.log('=== Listener Exceedances ===\\n');
if (listeners && Array.isArray(listeners.exceedances) && listeners.exceedances.length > 0) {
  for (var i = 0; i < listeners.exceedances.length; i++) {
    var e = listeners.exceedances[i];
    console.log('  ' + e.eventType + ' on ' + (e.targetType || '?') + '  listenerCount=' + e.listenerCount + '  threshold=' + e.threshold);
    if (e.stack) {
      var lines = e.stack.split('\\n').slice(0, 3);
      for (var j = 0; j < lines.length; j++) console.log('    ' + lines[j].trim());
    }
  }
  console.log();
} else {
  console.log('No maxListeners exceedances.\\n');
}

if (listeners && listeners.emitterCounts) {
  var leaky = Object.entries(listeners.emitterCounts).filter(function (e) {
    return (e[1].addCount || 0) > 0 && (e[1].removeCount || 0) === 0;
  });
  if (leaky.length > 0) {
    console.log('=== Listener Imbalances (adds without removes) ===\\n');
    for (var i = 0; i < leaky.length; i++) {
      console.log('  ' + leaky[i][0] + '  adds=' + leaky[i][1].addCount + '  removes=0');
    }
    console.log();
  }
}

console.log('=== Slow Tests ===\\n');
if (Array.isArray(slowTests) && slowTests.length > 0) {
  for (var i = 0; i < Math.min(5, slowTests.length); i++) {
    var t = slowTests[i];
    console.log('  ' + (t.name || t.file || '?') + '  ' + (t.duration || 0).toFixed(1) + 'ms');
  }
  console.log();
} else {
  console.log('No slow tests data.\\n');
}

console.log('=== All Source Files ===\\n');
try {
  var srcFiles = fs.readdirSync('src', { recursive: true });
  for (var i = 0; i < srcFiles.length; i++) {
    var full = 'src/' + srcFiles[i];
    try {
      if (fs.statSync(full).isFile() && /\\.[jt]sx?$/.test(full)) console.log('  ' + full);
    } catch (_) {}
  }
} catch (_) {
  console.log('  (could not list src/)');
}
try {
  var testFiles = fs.readdirSync('tests', { recursive: true });
  for (var i = 0; i < testFiles.length; i++) {
    var full = 'tests/' + testFiles[i];
    try {
      if (fs.statSync(full).isFile() && /\\.[jt]sx?$/.test(full)) console.log('  ' + full);
    } catch (_) {}
  }
} catch (_) {}
console.log();
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
  'skills/profile-analysis/helpers/analyze-workspace.js': ANALYZE_WORKSPACE_JS,
  'skills/profile-analysis/helpers/analyze-hotfunctions.js': ANALYZE_HOTFUNCTIONS_JS,
  'skills/profile-analysis/helpers/analyze-listeners.js': ANALYZE_LISTENERS_JS,
  'skills/profile-analysis/helpers/find-leaks.js': FIND_LEAKS_JS,
};
