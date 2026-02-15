# @zeitzeuge/vitest

Vitest plugin for AI-powered performance analysis. Instruments your test suite with V8 CPU profiling, classifies hot functions by source category, and runs a Deep Agent that analyzes your **application code** and provides code-level optimization suggestions.

## Install

```bash
npm install -D @zeitzeuge/vitest
```

Requires Vitest >= 3.1.0 and an LLM API key:

```bash
export OPENAI_API_KEY=sk-...    # or ANTHROPIC_API_KEY
```

## Usage

Add the plugin to your `vitest.config.ts`:

```ts
import { defineConfig } from 'vitest/config';
import { zeitzeuge } from '@zeitzeuge/vitest';

export default defineConfig({
  plugins: [zeitzeuge()],
});
```

Run your tests as usual -- zeitzeuge instruments the run with V8 CPU profiling, collects the profiles, and runs a Deep Agent analysis after tests complete:

```bash
vitest run
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

## How it works

1. **Instruments Vitest** -- injects `--cpu-prof` into worker process args, forces `pool: 'forks'` for reliable profiling, disables file parallelism for clean per-file profiles
2. **Captures V8 CPU profiles** for each test file during the test run
3. **Classifies hot functions** -- every profiled function is categorized as `application`, `dependency`, `test`, or `framework` based on its file path relative to your project root
4. **Builds a VFS workspace** containing hot function data, per-file CPU breakdowns, profile summaries, timing data, and actual source files
5. **Deep Agent analyzes your application code** -- focuses on bottlenecks in the code you wrote, not test infrastructure overhead

## What it finds

**Application code bottlenecks:**

- Hot functions with high self time in your source code
- Expensive algorithms (O(n^2) loops, redundant computation, unnecessary sorting)
- Object allocation hotspots driving GC pressure
- Synchronous blocking in hot paths (file I/O, crypto, JSON serialization)

**Dependency bottlenecks:**

- Third-party libraries consuming disproportionate CPU
- Unnecessary calls to expensive dependency APIs in hot paths
- Suggestions for alternative libraries or configuration changes

**Event listener issues:**

- Listener accumulation (addEventListener without matching removeEventListener)
- Listener exceedances (exceeding maxListeners threshold)

## Plugin options

```ts
zeitzeuge({
  // Enable/disable the plugin (default: true)
  enabled: true,

  // Path for the Markdown report (default: 'zeitzeuge-report.md')
  output: 'zeitzeuge-report.md',

  // Directory for temporary .cpuprofile files (default: '.zeitzeuge-profiles')
  profileDir: '.zeitzeuge-profiles',

  // Also write V8 heap profiles via --heap-prof (default: false)
  heapProf: false,

  // Run Deep Agent analysis after tests finish (default: true)
  analyzeOnFinish: true,

  // Project root for classifying application vs dependency code (default: process.cwd())
  projectRoot: process.cwd(),

  // Enable debug logging (default: false)
  verbose: false,
});
```

### Heap profiling (`heapProf`)

Captures allocation sampling (`.heapprofile` files) to help find allocation hotspots and GC pressure. Defaults to `false` because the overhead can skew CPU profiles. Enable it when you suspect allocation/GC issues.

## Environment variables

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key (preferred)                                      |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback)                                    |
| `ZEITZEUGE_MODEL`   | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |

## Related packages

- [`zeitzeuge`](../cli/) -- CLI for page-load performance analysis
- [`@zeitzeuge/utils`](../utils/) -- Shared internals (private, not published)

## License

MIT
