---
title: Bun Test Runner
description: Performance analysis integration for the Bun test runner with CPU profiling and AI-powered insights.
order: 4
---

# Bun Test Runner

Profile your `bun test` suite and get AI-powered analysis of your application code performance.

## Installation

```bash
bun add @zeitzeuge/bun
```

## Setup

Run your tests with CPU profiling and the zeitzeuge preload script:

```bash
bun test --preload @zeitzeuge/bun/preload
```

Then analyze the results:

```ts
import { analyzeTestRun } from '@zeitzeuge/bun';

await analyzeTestRun();
```

Or combine both steps in a single script:

```ts
// scripts/profile-tests.ts
import { $ } from 'bun';
import { analyzeTestRun } from '@zeitzeuge/bun';

await $`bun test --preload @zeitzeuge/bun/preload`;
await analyzeTestRun();
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

> **Heads-up — cost & runtime impact**
>
> Zeitzeuge profiles every test file, analyzes the results with an LLM, and
> produces a report. Depending on the size of your project this can add **60 seconds
> or more** to each test run and **consumes API tokens**. It is designed as an
> investigation tool, not something you run on every commit.

### Recommended: on-demand profiling

Add a dedicated script for profiling:

```json
{
  "scripts": {
    "test": "bun test",
    "test:profile": "bun scripts/profile-tests.ts"
  }
}
```

Normal test runs stay fast and free of charge:

```bash
bun test                # regular run — no profiling, no LLM cost
```

When you want to investigate performance:

```bash
bun run test:profile    # profiles tests + generates AI report
```

## Options

```ts
await analyzeTestRun({
  // Enable/disable analysis (default: true)
  enabled: true,

  // Path for the Markdown report (default: 'zeitzeuge-report.md')
  output: 'zeitzeuge-report.md',

  // Directory for temporary profile files (default: '.zeitzeuge-profiles')
  profileDir: '.zeitzeuge-profiles',

  // Run Deep Agent analysis (default: true)
  analyzeOnFinish: true,

  // Project root for classifying code (default: process.cwd())
  projectRoot: process.cwd(),

  // Enable debug logging (default: false)
  verbose: false,
});
```

| Option            | Type      | Default                 | Description                           |
| ----------------- | --------- | ----------------------- | ------------------------------------- |
| `enabled`         | `boolean` | `true`                  | Enable/disable analysis               |
| `output`          | `string`  | `'zeitzeuge-report.md'` | Path for the Markdown report          |
| `profileDir`      | `string`  | `'.zeitzeuge-profiles'` | Directory for temporary profile files |
| `analyzeOnFinish` | `boolean` | `true`                  | Run Deep Agent analysis               |
| `projectRoot`     | `string`  | `process.cwd()`         | Project root for classifying code     |
| `verbose`         | `boolean` | `false`                 | Enable debug logging                  |

## How It Works

1. **Preload script captures timing** — injected via `--preload`, it uses Bun's test lifecycle hooks to record per-test timing data
2. **V8-compatible CPU profiles** — Bun generates `.cpuprofile` files in the same V8 format used by Node.js
3. **Correlates profiles with test files** — profiles are matched to test files by execution order
4. **Classifies hot functions** — every profiled function is categorized as `application`, `dependency`, `test`, or `framework`
5. **Deep Agent analyzes your application code** — focuses on bottlenecks in the code you wrote, not test infrastructure overhead

## Requirements

- Bun >= 1.0
- An LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
