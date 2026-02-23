---
title: Node.js Test Runner
description: Custom reporter for the Node.js built-in test runner with V8 CPU profiling and AI-powered analysis.
order: 3
---

# Node.js Test Runner

Profile your `node --test` suite and get AI-powered analysis of your application code performance.

## Installation

```bash
npm install @zeitzeuge/node-test
```

## Setup

Run your tests with CPU profiling enabled and the zeitzeuge reporter:

```bash
node --test \
  --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \
  --test-reporter @zeitzeuge/node-test/reporter \
  --test-reporter-destination stdout \
  tests/*.test.js
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

> **Heads-up — cost & runtime impact**
>
> Zeitzeuge profiles every test file, analyzes the results with an LLM, and
> produces a report. Depending on the size of your project this can add **60 seconds
> or more** to each test run and **consumes API tokens**. It is designed as an
> investigation tool, not something you run on every commit.

### Recommended: on-demand profiling

Create a script in `package.json` so profiling only runs when you explicitly opt in:

```json
{
  "scripts": {
    "test": "node --test tests/*.test.js",
    "test:profile": "node --test --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles --test-reporter @zeitzeuge/node-test/reporter --test-reporter-destination stdout tests/*.test.js"
  }
}
```

Normal test runs stay fast and free of charge:

```bash
npm test                # regular run — no profiling, no LLM cost
```

When you want to investigate performance:

```bash
npm run test:profile    # profiles tests + generates AI report
```

## Configuration

The reporter is configured via environment variables:

| Variable                 | Default               | Description                                 |
| ------------------------ | --------------------- | ------------------------------------------- |
| `ZEITZEUGE_PROFILE_DIR`  | `.zeitzeuge-profiles` | Directory for temporary `.cpuprofile` files |
| `ZEITZEUGE_OUTPUT`       | `zeitzeuge-report.md` | Path for the Markdown report                |
| `ZEITZEUGE_PROJECT_ROOT` | `process.cwd()`       | Project root for classifying code           |
| `ZEITZEUGE_VERBOSE`      | `false`               | Enable debug logging (`"true"` to enable)   |
| `ZEITZEUGE_ANALYZE`      | `true`                | Run AI analysis (`"false"` to disable)      |

## How It Works

1. **Instruments the test runner** — `--cpu-prof` tells Node.js to write V8 CPU profiles for each forked test process
2. **Custom reporter collects timing** — the reporter consumes `test:pass`, `test:fail`, and `test:summary` events to extract per-test timing data
3. **Correlates profiles with test files** — `.cpuprofile` files are matched to test files by execution order
4. **Classifies hot functions** — every profiled function is categorized as `application`, `dependency`, `test`, or `framework`
5. **Deep Agent analyzes your application code** — focuses on bottlenecks in the code you wrote, not test infrastructure overhead

## Programmatic API

You can also use the analysis pipeline programmatically:

```ts
import {
  parseCpuProfile,
  classifyScript,
  computeMetrics,
  createTestWorkspace,
  analyzeTestPerformance,
  initModel,
} from '@zeitzeuge/node-test';
```

## Requirements

- Node.js >= 22 (for stable `node:test` with process isolation)
- An LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)
