const SKILL_MD = `---
name: browser-analysis
description: Use this skill when analyzing browser page-load performance data including Chrome traces, heap snapshots, network waterfalls, and runtime blocking functions. Provides pre-built analysis scripts for common browser performance patterns.
---

# Browser Analysis Scripts

## Overview

Pre-built scripts for analyzing browser performance data. Run these
directly or use them as templates for custom analysis.

## START HERE — Workspace overview

Run this FIRST to get a prioritized summary of the entire workspace:

execute_command: node skills/browser-analysis/helpers/analyze-browser-workspace.js

Reads trace/summary.json, heap/summary.json, trace/runtime/summary.json,
blocking-functions.json, event-listeners.json, and network-waterfall.json.
Outputs:
- Page load metrics (FCP, LCP, TBT, load time)
- Heap snapshot overview (total size, detached DOM nodes, closures)
- Runtime trace summary (blocking function count, GC stats, frame breakdown)
- Top blocking functions with script locations
- Listener imbalances
- Render-blocking resources
- Large resources (>100KB)
- Full list of available source files with sizes

Use this output to decide which source files to read and which scripts
to run for deeper analysis.

## Additional scripts

### Analyze blocking functions (detailed)
execute_command: node skills/browser-analysis/helpers/analyze-blockers.js [--threshold 50]

Reads trace/runtime/blocking-functions.json, filters by duration threshold
(default 50ms), and outputs a ranked summary with call stacks and script
locations. Also identifies compound blockers.

### Analyze network waterfall (detailed)
execute_command: node skills/browser-analysis/helpers/analyze-waterfall.js

Reads trace/network-waterfall.json and trace/summary.json, outputs:
- Render-blocking resources with sizes and durations
- Large scripts (>100KB) with workspace paths
- Sequential chains that could be parallelized
- Uncompressed resources

### Analyze heap snapshot (detailed)
execute_command: node skills/browser-analysis/helpers/analyze-heap.js

Reads heap/summary.json, outputs:
- Detached DOM nodes with retainer paths
- Top 10 largest retained objects
- Constructor hotspots
- Closures with large retained sizes

### Find source code patterns
execute_command: node skills/browser-analysis/helpers/find-patterns.js [--pattern addEventListener]

Searches source files for performance anti-patterns.

## Key data files

- heap/summary.json — parsed V8 heap snapshot (detached nodes, retained objects, closures)
- trace/summary.json — page load metrics, render-blocking resources, resource breakdown
- trace/network-waterfall.json — every network request with timing, size, priority
- trace/asset-manifest.json — index of all assets with stored file paths
- trace/runtime/summary.json — runtime trace overview (frame breakdown, GC stats)
- trace/runtime/blocking-functions.json — main-thread blocking functions with call stacks
- trace/runtime/event-listeners.json — event listener add/remove counts
- trace/runtime/frame-breakdown.json — time in scripting vs layout vs paint vs GC
- scripts/*.js — actual JavaScript source files captured during page load
- styles/*.css — actual CSS source files
- html/document.html — the HTML document

## Writing custom scripts

Read skills/data-scripting/schemas.md for JSON structures, then write
scripts that load and query the data.
`;

const ANALYZE_BROWSER_WORKSPACE_JS = `'use strict';

var fs = require('fs');

function tryRead(path) {
  try { return JSON.parse(fs.readFileSync(path, 'utf8')); }
  catch (_) { return null; }
}

var traceSummary = tryRead('trace/summary.json');
var heapSummary = tryRead('heap/summary.json');
var rtSummary = tryRead('trace/runtime/summary.json');
var waterfall = tryRead('trace/network-waterfall.json');
var assetManifest = tryRead('trace/asset-manifest.json');
var blockingFunctions = tryRead('trace/runtime/blocking-functions.json');
var eventListeners = tryRead('trace/runtime/event-listeners.json');

console.log('=== Browser Workspace Overview ===\\n');

if (traceSummary) {
  var t = traceSummary.timing || traceSummary;
  console.log('URL: ' + (traceSummary.url || '(unknown)'));
  console.log('Page load: ' + Math.round(t.loadComplete || 0) + 'ms | FCP: ' + Math.round(t.firstContentfulPaint || 0) + 'ms | LCP: ' + Math.round(t.largestContentfulPaint || 0) + 'ms | TBT: ' + Math.round(t.totalBlockingTime || 0) + 'ms');
  console.log('Requests: ' + (traceSummary.requestCount || 0) + ' | Transfer: ' + ((traceSummary.totalTransferSize || 0) / 1024).toFixed(1) + ' KB | Decoded: ' + ((traceSummary.totalDecodedSize || 0) / 1024).toFixed(1) + ' KB');
  if (traceSummary.renderBlockingResources && traceSummary.renderBlockingResources.length > 0) {
    console.log('Render-blocking: ' + traceSummary.renderBlockingResources.length + ' resources');
  }
  console.log();
}

if (heapSummary) {
  var meta = heapSummary.metadata || {};
  console.log('=== Heap Summary ===\\n');
  console.log('Total heap: ' + ((meta.totalSize || 0) / 1024 / 1024).toFixed(2) + ' MB | Nodes: ' + (meta.nodeCount || 0) + ' | Edges: ' + (meta.edgeCount || 0));
  var detached = heapSummary.detachedNodes || heapSummary.detachedDomNodes;
  if (detached) {
    var dCount = detached.count || (Array.isArray(detached) ? detached.length : 0);
    var dSize = detached.totalSize || 0;
    console.log('Detached DOM nodes: ' + dCount + (dSize ? ' (' + (dSize / 1024).toFixed(1) + ' KB)' : ''));
  }
  var closures = heapSummary.closureStats;
  if (closures && closures.count) {
    console.log('Closures: ' + closures.count + ' (' + ((closures.totalSize || 0) / 1024).toFixed(1) + ' KB)');
  }
  console.log();
}

if (rtSummary) {
  console.log('=== Runtime Trace Summary ===\\n');
  console.log('Trace duration: ' + Math.round(rtSummary.traceDuration || 0) + 'ms');
  console.log('Blocking functions: ' + (rtSummary.blockingFunctionCount || 0));
  console.log('Listener imbalances: ' + (rtSummary.listenerImbalances || 0));
  console.log('GC pauses: ' + (rtSummary.gcPauseCount || 0) + ' (' + Math.round(rtSummary.gcTotalDuration || 0) + 'ms total)');
  if (rtSummary.frameBreakdown) {
    var fb = rtSummary.frameBreakdown;
    console.log('Frame breakdown: scripting=' + Math.round(fb.scripting || 0) + 'ms  layout=' + Math.round(fb.layout || 0) + 'ms  paint=' + Math.round(fb.paint || 0) + 'ms  gc=' + Math.round(fb.gc || 0) + 'ms');
  }
  if (rtSummary.frequentEventTypes && rtSummary.frequentEventTypes.length > 0) {
    console.log('Frequent events: ' + rtSummary.frequentEventTypes.join(', '));
  }
  console.log();
}

if (Array.isArray(blockingFunctions) && blockingFunctions.length > 0) {
  console.log('=== Top Blocking Functions ===\\n');
  var top = blockingFunctions.slice(0, 10);
  for (var i = 0; i < top.length; i++) {
    var fn = top[i];
    console.log('  [' + (fn.duration || 0) + 'ms] ' + (fn.functionName || '(anonymous)') + ' @ ' + (fn.scriptUrl || 'unknown') + ':' + (fn.lineNumber || '?'));
  }
  if (blockingFunctions.length > 10) {
    console.log('  ... and ' + (blockingFunctions.length - 10) + ' more');
  }
  console.log();
}

if (Array.isArray(eventListeners) && eventListeners.length > 0) {
  var imbalanced = eventListeners.filter(function (l) {
    return (l.addCount || 0) > (l.removeCount || 0) + 2;
  });
  if (imbalanced.length > 0) {
    console.log('=== Listener Imbalances (adds >> removes) ===\\n');
    for (var i = 0; i < imbalanced.length; i++) {
      var l = imbalanced[i];
      console.log('  ' + l.eventType + ' on ' + (l.targetType || '?') + '  adds=' + l.addCount + '  removes=' + (l.removeCount || 0) + '  active=' + (l.activeCount || 0));
    }
    console.log();
  }
}

if (traceSummary && traceSummary.renderBlockingResources && traceSummary.renderBlockingResources.length > 0) {
  console.log('=== Render-Blocking Resources ===\\n');
  var rbs = traceSummary.renderBlockingResources;
  for (var i = 0; i < rbs.length; i++) {
    var r = rbs[i];
    console.log('  [' + (r.type || '?') + '] ' + (r.url || '?'));
    console.log('    Size: ' + ((r.size || 0) / 1024).toFixed(1) + ' KB | Duration: ' + Math.round(r.duration || 0) + 'ms' + (r.path ? ' | File: ' + r.path : ''));
  }
  console.log();
}

if (Array.isArray(waterfall)) {
  var large = waterfall.filter(function (r) {
    return (r.size || 0) > 100000;
  });
  if (large.length > 0) {
    large.sort(function (a, b) { return (b.size || 0) - (a.size || 0); });
    console.log('=== Large Resources (>100KB) ===\\n');
    for (var i = 0; i < Math.min(10, large.length); i++) {
      var r = large[i];
      console.log('  [' + (r.type || '?') + '] ' + ((r.size || 0) / 1024).toFixed(1) + 'KB  ' + (r.url || '?'));
      if (r.path) console.log('    File: ' + r.path);
    }
    console.log();
  }
}

console.log('=== Available Files ===\\n');
var dirs = ['scripts', 'styles', 'html', 'other'];
for (var d = 0; d < dirs.length; d++) {
  try {
    var files = fs.readdirSync(dirs[d]);
    if (files.length > 0) {
      for (var i = 0; i < files.length; i++) {
        var full = dirs[d] + '/' + files[i];
        try {
          var stat = fs.statSync(full);
          if (stat.isFile()) console.log('  ' + full + '  (' + (stat.size / 1024).toFixed(1) + ' KB)');
        } catch (_) {}
      }
    }
  } catch (_) {}
}
console.log();
`;

const ANALYZE_BLOCKERS_JS = `'use strict';
var fs = require('fs');

var threshold = 50;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--threshold' && args[i + 1]) {
    threshold = parseInt(args[i + 1], 10);
    if (isNaN(threshold)) threshold = 50;
  }
}

var data;
try {
  data = JSON.parse(fs.readFileSync('trace/runtime/blocking-functions.json', 'utf8'));
} catch (e) {
  console.log('Could not read trace/runtime/blocking-functions.json:', e.message);
  process.exit(0);
}

if (!Array.isArray(data)) {
  console.log('Expected an array in blocking-functions.json');
  process.exit(0);
}

var blockers = data.filter(function (fn) { return fn.duration >= threshold; });
blockers.sort(function (a, b) { return b.duration - a.duration; });

if (blockers.length === 0) {
  console.log('No blocking functions found above ' + threshold + 'ms threshold.');
  process.exit(0);
}

function workspacePath(url) {
  if (!url) return '';
  var parts = url.split('/');
  var filename = parts[parts.length - 1];
  if (!filename) return url;
  return 'scripts/' + filename;
}

var blockerNames = {};
blockers.forEach(function (fn) {
  blockerNames[fn.functionName] = true;
});

console.log('=== Blocking Functions (>=' + threshold + 'ms) ===');
console.log('Found ' + blockers.length + ' blocking function(s)\\n');

blockers.forEach(function (fn, idx) {
  var wsPath = workspacePath(fn.scriptUrl);
  console.log((idx + 1) + '. [' + fn.duration + 'ms] ' + (fn.functionName || '(anonymous)') +
    ' @ ' + (fn.scriptUrl || 'unknown') + ':' + (fn.lineNumber || '?'));
  if (wsPath) {
    console.log('   Workspace: ' + wsPath);
  }

  if (fn.callStack && fn.callStack.length > 0) {
    console.log('   Call stack:');
    fn.callStack.forEach(function (caller) {
      console.log('     <- ' + (caller.functionName || '(anonymous)') +
        ' @ ' + (caller.scriptUrl || 'unknown') + ':' + (caller.lineNumber || '?'));
    });
  }

  if (fn.callStack && fn.callStack.length > 0) {
    var compounds = fn.callStack.filter(function (caller) {
      return blockerNames[caller.functionName];
    });
    if (compounds.length > 0) {
      console.log('   ⚠ Compound blocker — calls into:');
      compounds.forEach(function (c) {
        console.log('     → ' + c.functionName);
      });
    }
  }

  console.log('');
});
`;

const ANALYZE_WATERFALL_JS = `'use strict';
var fs = require('fs');

var waterfall;
try {
  waterfall = JSON.parse(fs.readFileSync('trace/network-waterfall.json', 'utf8'));
} catch (e) {
  console.log('Could not read trace/network-waterfall.json:', e.message);
  process.exit(0);
}

var summary = null;
try {
  summary = JSON.parse(fs.readFileSync('trace/summary.json', 'utf8'));
} catch (e) {
  // summary is optional
}

if (!Array.isArray(waterfall)) {
  console.log('Expected an array in network-waterfall.json');
  process.exit(0);
}

function workspacePath(url) {
  if (!url) return '';
  var parts = url.split('/');
  var filename = parts[parts.length - 1];
  if (!filename) return url;
  var qIdx = filename.indexOf('?');
  if (qIdx > -1) filename = filename.substring(0, qIdx);
  return 'scripts/' + filename;
}

function toKB(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// 1. Render-blocking resources
var renderBlocking = waterfall.filter(function (r) { return r.isRenderBlocking; });
console.log('=== Render-Blocking Resources ===');
if (renderBlocking.length === 0) {
  console.log('None found.\\n');
} else {
  console.log('Found ' + renderBlocking.length + ' render-blocking resource(s)\\n');
  renderBlocking.forEach(function (r) {
    console.log('  ' + (r.type || 'unknown') + ': ' + (r.url || 'unknown'));
    console.log('    Size: ' + toKB(r.size || r.encodedSize || 0) +
      ' | Duration: ' + ((r.duration || 0).toFixed(1)) + 'ms');
    console.log('    Workspace: ' + workspacePath(r.url));
    console.log('');
  });
}

// 2. Large scripts (>100KB)
var largeScripts = waterfall.filter(function (r) {
  return r.type === 'Script' && (r.size || r.decodedSize || 0) > 100000;
});
console.log('=== Large Scripts (>100KB) ===');
if (largeScripts.length === 0) {
  console.log('None found.\\n');
} else {
  largeScripts.sort(function (a, b) {
    return (b.size || b.decodedSize || 0) - (a.size || a.decodedSize || 0);
  });
  console.log('Found ' + largeScripts.length + ' large script(s)\\n');
  largeScripts.forEach(function (r) {
    console.log('  ' + (r.url || 'unknown'));
    console.log('    Size: ' + toKB(r.size || r.decodedSize || 0) +
      ' | Duration: ' + ((r.duration || 0).toFixed(1)) + 'ms');
    console.log('    Workspace: ' + workspacePath(r.url));
    console.log('');
  });
}

// 3. Sequential chains
var scriptAndStyle = waterfall.filter(function (r) {
  return r.type === 'Script' || r.type === 'Stylesheet';
});
scriptAndStyle.sort(function (a, b) {
  return (a.startTime || 0) - (b.startTime || 0);
});

var chains = [];
for (var i = 0; i < scriptAndStyle.length - 1; i++) {
  var a = scriptAndStyle[i];
  var aEnd = (a.startTime || 0) + (a.duration || 0);
  for (var j = i + 1; j < scriptAndStyle.length; j++) {
    var b = scriptAndStyle[j];
    if ((b.startTime || 0) >= aEnd) {
      var chainDuration = (b.startTime || 0) + (b.duration || 0) - (a.startTime || 0);
      if (chainDuration > 200) {
        chains.push({ a: a, b: b, duration: chainDuration });
      }
      break;
    }
  }
}

console.log('=== Sequential Chains (could be parallelized) ===');
if (chains.length === 0) {
  console.log('None found.\\n');
} else {
  console.log('Found ' + chains.length + ' sequential chain(s)\\n');
  chains.forEach(function (c) {
    console.log('  ' + (c.a.url || 'unknown') + ' → ' + (c.b.url || 'unknown'));
    console.log('    Chain duration: ' + c.duration.toFixed(1) + 'ms');
    console.log('');
  });
}

// 4. Summary render-blocking info
if (summary && summary.renderBlockingResources) {
  console.log('=== Summary: Render-Blocking Resources ===');
  var rbs = summary.renderBlockingResources;
  if (Array.isArray(rbs)) {
    rbs.forEach(function (r) {
      console.log('  ' + (r.url || JSON.stringify(r)));
    });
  } else {
    console.log('  ' + JSON.stringify(rbs, null, 2));
  }
  console.log('');
}
`;

const ANALYZE_HEAP_JS = `'use strict';
var fs = require('fs');

var data;
try {
  data = JSON.parse(fs.readFileSync('heap/summary.json', 'utf8'));
} catch (e) {
  console.log('Could not read heap/summary.json:', e.message);
  process.exit(0);
}

function retainerChain(retainerPath) {
  if (!Array.isArray(retainerPath)) return '';
  return retainerPath.map(function (r) {
    return r.name || r.className || '(unknown)';
  }).join(' ← ');
}

function toKB(bytes) {
  return (bytes / 1024).toFixed(1) + ' KB';
}

// 1. Detached DOM nodes
console.log('=== Detached DOM Nodes ===');
var detached = data.detachedDomNodes || data.detachedNodes || [];
if (!Array.isArray(detached) || detached.length === 0) {
  console.log('None found.\\n');
} else {
  var totalSize = detached.reduce(function (sum, n) {
    return sum + (n.retainedSize || n.selfSize || 0);
  }, 0);
  console.log('Count: ' + detached.length + ' | Total retained size: ' + toKB(totalSize) + '\\n');
  detached.forEach(function (node) {
    console.log('  ' + (node.name || node.className || '(node)'));
    console.log('    Retained: ' + toKB(node.retainedSize || 0) +
      ' | Self: ' + toKB(node.selfSize || 0));
    if (node.retainerPath) {
      console.log('    Retainer path: ' + retainerChain(node.retainerPath));
    }
    if (node.scriptUrl) {
      console.log('    ➜ Read: ' + node.scriptUrl);
    }
    console.log('');
  });
}

// 2. Top 10 largest retained objects
console.log('=== Top 10 Largest Retained Objects ===');
var objects = data.topRetainedObjects || data.largestObjects || [];
if (!Array.isArray(objects) || objects.length === 0) {
  console.log('None found.\\n');
} else {
  var top10 = objects.slice(0, 10);
  top10.forEach(function (obj, idx) {
    console.log((idx + 1) + '. ' + (obj.name || '(unknown)') + ' [' + (obj.type || obj.className || '?') + ']');
    console.log('   Self: ' + toKB(obj.selfSize || 0) + ' | Retained: ' + toKB(obj.retainedSize || 0));
    if (obj.retainerPath) {
      console.log('   Retainer path: ' + retainerChain(obj.retainerPath));
    }
    if (obj.scriptUrl) {
      console.log('   ➜ Read: ' + obj.scriptUrl);
    }
    console.log('');
  });
}

// 3. Constructor hotspots
console.log('=== Constructor Hotspots (Top 10 by instance count) ===');
var constructors = data.constructorStats || [];
if (!Array.isArray(constructors) || constructors.length === 0) {
  console.log('None found.\\n');
} else {
  var sorted = constructors.slice().sort(function (a, b) {
    return (b.instanceCount || b.count || 0) - (a.instanceCount || a.count || 0);
  });
  sorted.slice(0, 10).forEach(function (c, idx) {
    console.log((idx + 1) + '. ' + (c.name || c.constructor || '(unknown)') +
      ' — ' + (c.instanceCount || c.count || 0) + ' instances' +
      ' | Total size: ' + toKB(c.totalSize || c.retainedSize || 0));
  });
  console.log('');
}

// 4. Top closures
console.log('=== Top Closures by Context Size ===');
var closureStats = data.closureStats || {};
var topClosures = closureStats.topClosures || [];
if (!Array.isArray(topClosures) || topClosures.length === 0) {
  console.log('None found.\\n');
} else {
  topClosures.slice(0, 10).forEach(function (cl, idx) {
    console.log((idx + 1) + '. ' + (cl.name || cl.functionName || '(anonymous)') +
      ' — context: ' + toKB(cl.contextSize || 0) +
      ' | retained: ' + toKB(cl.retainedSize || 0));
    if (cl.scriptUrl) {
      console.log('   ➜ Read: ' + cl.scriptUrl);
    }
  });
  console.log('');
}
`;

const FIND_PATTERNS_JS = `'use strict';
var fs = require('fs');

var onlyPattern = null;
var args = process.argv.slice(2);
for (var i = 0; i < args.length; i++) {
  if (args[i] === '--pattern' && args[i + 1]) {
    onlyPattern = args[i + 1];
  }
}

function normalizePath(p) {
  return p.startsWith('/') ? p.slice(1) : p;
}

var filePaths = [];

try {
  var manifest = JSON.parse(fs.readFileSync('trace/asset-manifest.json', 'utf8'));
  if (Array.isArray(manifest)) {
    manifest.forEach(function (entry) {
      var p = entry.storedPath || entry.path;
      if (p) filePaths.push(normalizePath(p));
    });
  } else if (manifest && typeof manifest === 'object') {
    Object.keys(manifest).forEach(function (key) {
      var entry = manifest[key];
      var p = (typeof entry === 'string') ? entry : (entry && (entry.storedPath || entry.path));
      if (p) filePaths.push(normalizePath(p));
    });
  }
} catch (e) {
  // manifest not available
}

var extraPaths = ['html/document.html'];
extraPaths.forEach(function (p) {
  if (filePaths.indexOf(p) === -1) {
    try {
      fs.accessSync(p);
      filePaths.push(p);
    } catch (e) {
      // not available
    }
  }
});

function readFile(p) {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch (e) {
    return null;
  }
}

var patterns = {
  addEventListener: {
    test: function (line) {
      if (!/addEventListener/.test(line)) return false;
      if (/\\b(scroll|touchstart|touchmove|wheel)\\b/.test(line) && !/passive\\s*:\\s*true/.test(line)) {
        return true;
      }
      return false;
    },
    label: 'addEventListener without passive:true for scroll/touch/wheel'
  },
  missingDelegation: {
    test: function (line, allLines, idx) {
      if (!/querySelectorAll/.test(line)) return false;
      var window = allLines.slice(idx, Math.min(idx + 5, allLines.length)).join(' ');
      return /querySelectorAll/.test(window) && /forEach/.test(window) && /addEventListener/.test(window);
    },
    label: 'querySelectorAll+forEach+addEventListener (consider event delegation)'
  },
  syncXHR: {
    test: function (line) {
      return /XMLHttpRequest/.test(line) && /\\.open\\(/.test(line) && /,\\s*false\\s*[),]/.test(line);
    },
    label: 'Synchronous XMLHttpRequest'
  },
  documentWrite: {
    test: function (line) {
      return /document\\.write\\s*\\(/.test(line);
    },
    label: 'document.write() blocks parsing'
  },
  cssImport: {
    test: function (line) {
      return /@import\\b/.test(line);
    },
    label: 'CSS @import creates sequential loading'
  },
  imgDimensions: {
    test: function (line) {
      if (!/<img\\b/i.test(line)) return false;
      var hasWidth = /\\bwidth\\s*=/.test(line);
      var hasHeight = /\\bheight\\s*=/.test(line);
      return !hasWidth || !hasHeight;
    },
    label: '<img> without width/height causes layout shift'
  }
};

var patternKeys = Object.keys(patterns);
if (onlyPattern) {
  if (!patterns[onlyPattern]) {
    console.log('Unknown pattern: ' + onlyPattern);
    console.log('Available: ' + patternKeys.join(', '));
    process.exit(0);
  }
  patternKeys = [onlyPattern];
}

var results = [];

filePaths.forEach(function (filePath) {
  var content = readFile(filePath);
  if (!content) return;
  var lines = content.split('\\n');
  lines.forEach(function (line, idx) {
    patternKeys.forEach(function (key) {
      if (patterns[key].test(line, lines, idx)) {
        results.push({
          path: filePath,
          lineNumber: idx + 1,
          pattern: key,
          label: patterns[key].label,
          line: line.trim()
        });
      }
    });
  });
});

if (results.length === 0) {
  console.log('No performance anti-patterns found.');
  process.exit(0);
}

console.log('=== Performance Anti-Patterns ===');
console.log('Found ' + results.length + ' issue(s)\\n');
results.forEach(function (r) {
  console.log(r.path + ':' + r.lineNumber + ': [' + r.pattern + '] ' + r.line);
});
`;

export const BROWSER_ANALYSIS_SKILL_FILES: Record<string, string> = {
  'skills/browser-analysis/SKILL.md': SKILL_MD,
  'skills/browser-analysis/helpers/analyze-browser-workspace.js': ANALYZE_BROWSER_WORKSPACE_JS,
  'skills/browser-analysis/helpers/analyze-blockers.js': ANALYZE_BLOCKERS_JS,
  'skills/browser-analysis/helpers/analyze-waterfall.js': ANALYZE_WATERFALL_JS,
  'skills/browser-analysis/helpers/analyze-heap.js': ANALYZE_HEAP_JS,
  'skills/browser-analysis/helpers/find-patterns.js': FIND_PATTERNS_JS,
};
