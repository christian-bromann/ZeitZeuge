---
title: Vitest Plugin
description: Drop-in Vitest plugin for V8 CPU profiling and AI-powered analysis of application code performance.
order: 2
---

# Vitest Plugin

Profile your test suite and get AI-powered analysis of your application code performance.

## Installation

```bash
npm install @zeitzeuge/vitest
```

## Setup

Add the plugin to your `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { zeitzeuge } from '@zeitzeuge/vitest';

export default defineConfig({
  plugins: [zeitzeuge()],
});
```

Then run your tests as usual:

```bash
vitest run
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

## Plugin Options

```ts
zeitzeuge({
  // Enable/disable the plugin (default: true)
  enabled: true,

  // Path for the Markdown report (default: 'zeitzeuge-report.md')
  output: 'zeitzeuge-report.md',

  // Directory for temporary .cpuprofile files (default: '.zeitzeuge-profiles')
  profileDir: '.zeitzeuge-profiles',

  // Also write V8 heap profiles (.heapprofile) for workers (default: false)
  heapProf: false,

  // Run Deep Agent analysis after tests finish (default: true)
  analyzeOnFinish: true,

  // Project root for classifying application vs dependency code (default: process.cwd())
  projectRoot: process.cwd(),

  // Enable debug logging (default: false)
  verbose: false,
});
```

| Option            | Type      | Default                 | Description                                 |
| ----------------- | --------- | ----------------------- | ------------------------------------------- |
| `enabled`         | `boolean` | `true`                  | Enable/disable the plugin                   |
| `output`          | `string`  | `'zeitzeuge-report.md'` | Path for the Markdown report                |
| `profileDir`      | `string`  | `'.zeitzeuge-profiles'` | Directory for temporary `.cpuprofile` files |
| `heapProf`        | `boolean` | `false`                 | Also write V8 heap profiles                 |
| `analyzeOnFinish` | `boolean` | `true`                  | Run Deep Agent analysis after tests finish  |
| `projectRoot`     | `string`  | `process.cwd()`         | Project root for classifying code           |
| `verbose`         | `boolean` | `false`                 | Enable debug logging                        |

## Heap Profiling

`heapProf` captures allocation sampling and can help you find allocation hotspots and high GC pressure caused by excessive short-lived objects.

It defaults to **`false`** because it can be a net negative for everyday runs:

- **Overhead**: allocation sampling adds runtime overhead and can skew timings/CPU profiles
- **Artifact size**: `.heapprofile` files can be large, increasing IO and CI flakiness
- **Noise**: test runners allocate a lot in setup/framework code; heap data can be less actionable unless you're specifically chasing allocations/GC

**Recommendation:** keep it off by default and enable it when you suspect allocation/GC issues or when CPU hotspots alone aren't explaining slow tests.

## How It Works

1. **Instruments Vitest** — injects `--cpu-prof` into worker process args, forces `pool: 'forks'` for reliable profiling, disables file parallelism for clean per-file profiles
2. **Captures V8 CPU profiles** for each test file during the test run
3. **Classifies hot functions** — every profiled function is categorized as `application`, `dependency`, `test`, or `framework` based on its file path relative to your project root
4. **Builds a VFS workspace** containing hot functions, per-file CPU time, full profile summaries, timing data, and actual source files
5. **Deep Agent analyzes your application code** — focuses on bottlenecks in the code you wrote, not test infrastructure overhead. Reports dependency issues when your code makes expensive calls into libraries.

## What It Finds

### Application Code Bottlenecks

- Hot functions with high self time in your source code
- Expensive algorithms (O(n²) loops, redundant computation, unnecessary sorting)
- Object allocation hotspots driving GC pressure
- Synchronous blocking in hot paths (file I/O, crypto, JSON serialization)

### Dependency Bottlenecks

- Third-party libraries consuming disproportionate CPU
- Unnecessary calls to expensive dependency APIs in hot paths
- Suggestions for alternative libraries or configuration changes

### GC Pressure

- Functions creating many short-lived objects in tight loops
- Large allocations that could be pooled or reused

## Workspace Mode

In Vitest workspaces with multiple projects, zeitzeuge automatically uses per-project profile directories and report files to avoid collisions. Each project gets its own:

- Profile directory (e.g. `.zeitzeuge-profiles/my-project/`)
- Report file (e.g. `zeitzeuge-report-my-project.md`)

This happens automatically when running in a workspace — no extra configuration needed. You can override the defaults by explicitly setting `profileDir` and `output` in the plugin options.
