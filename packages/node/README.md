# @zeitzeuge/node

Custom reporter for the Node.js built-in test runner (`node --test`) that collects V8 CPU profiles and runs AI-powered performance analysis on your application code.

## Installation

```bash
npm install @zeitzeuge/node
```

## Quick Start

Run your tests with CPU profiling enabled and the zeitzeuge reporter:

```bash
node --test \
  --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles \
  --test-reporter @zeitzeuge/node/reporter \
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
    "test:profile": "node --test --cpu-prof --cpu-prof-dir=.zeitzeuge-profiles --test-reporter @zeitzeuge/node/reporter --test-reporter-destination stdout tests/*.test.js"
  }
}
```

```bash
npm test                # regular run — no profiling, no LLM cost
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

You can use the analysis pipeline programmatically:

```ts
import {
  parseCpuProfile,
  classifyScript,
  computeMetrics,
  createNodeTestWorkspace,
  analyzeTestPerformance,
} from '@zeitzeuge/node';
```

### Exports

| Export                    | Description                                                          |
| ------------------------- | -------------------------------------------------------------------- |
| `zeitZeugeReporter`       | Async generator reporter for `node --test`                           |
| `analyzeTestPerformance`  | Run the Deep Agent analysis pipeline                                 |
| `NODE_TEST_SYSTEM_PROMPT` | System prompt used for the Node.js test analysis                     |
| `computeMetrics`          | Compute performance metrics from test timing and profile data        |
| `parseCpuProfile`         | Parse a V8 `.cpuprofile` file into a structured summary              |
| `createNodeTestWorkspace` | Build the workspace context sent to the analysis agent               |
| `mergeHotFunctions`       | Merge and deduplicate hot functions across profiles                  |
| `classifyScript`          | Classify a script URL as application, dependency, test, or framework |

## Requirements

- Node.js >= 22 (for stable `node:test` with process isolation)
- An LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)

## Related packages

- [`zeitzeuge`](../cli/) — CLI for page-load performance analysis
- [`@zeitzeuge/vitest`](../vitest/) — Vitest plugin for test suite performance analysis
- [`@zeitzeuge/utils`](../utils/) — Shared internal utilities
