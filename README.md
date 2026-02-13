# zeitzeuge

AI-powered performance analysis for frontend page loads and Vitest test suites. Captures V8 heap snapshots, performance traces, Chrome runtime traces, and CPU profiles — stores everything in a virtual filesystem and hands it to a Deep Agent that investigates bottlenecks and provides code-level fixes.

> *"Zeuge" = witness — the tool "witnesses" slowdowns in your page loads and test runs.*

## Quick start

### Page-load analysis

```bash
# Set your API key
export OPENAI_API_KEY=sk-...    # or ANTHROPIC_API_KEY

# Analyze any URL
npx zeitzeuge http://localhost:3000
```

### Vitest integration

Add the plugin to your `vitest.config.ts` to profile your test suite and get AI-powered analysis of your **application code** performance:

```ts
import { defineConfig } from 'vitest/config'
import { zeitzeuge } from 'zeitzeuge/vitest'

export default defineConfig({
  plugins: [
    zeitzeuge()
  ],
})
```

Run your tests as usual — zeitzeuge instruments the run with V8 CPU profiling, collects the profiles, and runs a Deep Agent analysis after tests complete:

```bash
vitest run
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

## How it works

### Page-load mode (`npx zeitzeuge <url>`)

1. **Launches Chrome** via WebdriverIO with DevTools Protocol access
2. **Captures everything in one page load:**
   - V8 heap snapshot (memory analysis)
   - Performance trace (network waterfall, long tasks, paint timing)
   - **Chrome runtime trace** via the [Tracing domain](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/) — every function call, event dispatch, layout, paint, and GC event on the main thread
   - All network assets (scripts, CSS, HTML source code)
3. **Builds a VFS workspace** using `@langchain/node-vfs` — an in-memory virtual filesystem containing:
   - `/heap/summary.json` — parsed heap snapshot data
   - `/trace/summary.json` — page load timing & metrics
   - `/trace/runtime/blocking-functions.json` — functions blocking the main thread > 50ms
   - `/trace/runtime/event-listeners.json` — event listener add/remove imbalances
   - `/trace/runtime/frame-breakdown.json` — time breakdown: scripting vs layout vs paint vs GC
   - `/scripts/`, `/styles/`, `/html/` — actual source files
4. **Deep Agent explores** — a LangChain Deep Agent (`deepagents`) autonomously browses the workspace, reads actual source code, greps for patterns, and correlates heap data with trace data and runtime analysis
5. **Reports findings** — memory leaks, frame-blocking functions, listener leaks, render-blocking scripts, GC pressure — with code-level fixes

### Vitest mode (`zeitzeuge/vitest` plugin)

1. **Instruments Vitest** — injects `--cpu-prof` into worker process args, forces `pool: 'forks'` for reliable profiling, disables file parallelism for clean per-file profiles
2. **Captures V8 CPU profiles** for each test file during the test run
3. **Classifies hot functions** — every profiled function is categorized as `application`, `dependency`, `test`, or `framework` based on its file path relative to your project root
4. **Builds a VFS workspace** containing:
   - `/hot-functions/application.json` — hotspots in **your** code (primary focus)
   - `/hot-functions/dependencies.json` — hotspots in third-party code
   - `/scripts/application.json` — per-file CPU time for your source files
   - `/scripts/dependencies.json` — per-file CPU time for dependencies
   - `/profiles/*.json` — full CPU profile summaries with call trees
   - `/timing/overview.json` — per-test timing data
   - `/src/`, `/tests/` — actual source files referenced by hot functions
5. **Deep Agent analyzes your application code** — focuses on bottlenecks in the code you wrote, not test infrastructure overhead. Reports dependency issues when your code makes expensive calls into libraries.

## What it finds

### Page-load analysis

**Memory issues:**
- Memory leaks (unbounded caches, growing arrays/maps)
- Detached DOM nodes still referenced in JavaScript
- Large retained objects and closure leaks

**Page-load issues:**
- Render-blocking scripts (`<script>` without `async`/`defer`)
- Render-blocking stylesheets
- Long main-thread tasks (> 50ms)
- Oversized bundles and unused code
- Sequential waterfall bottlenecks

**Runtime issues:**
- **Frame-blocking functions** — exact function name, script URL, line number, and call stack for any function blocking the main thread > 50ms
- **Event listener leaks** — `addEventListener` calls without matching `removeEventListener`, growing listener counts
- **GC pressure** — frequent or long garbage collection pauses indicating memory churn
- **Layout thrashing** — forced synchronous layouts from reading layout properties after DOM mutations

### Vitest analysis

**Application code bottlenecks:**
- Hot functions with high self time in your source code
- Expensive algorithms (O(n^2) loops, redundant computation, unnecessary sorting)
- Object allocation hotspots driving GC pressure
- Synchronous blocking in hot paths (file I/O, crypto, JSON serialization)

**Dependency bottlenecks:**
- Third-party libraries consuming disproportionate CPU
- Unnecessary calls to expensive dependency APIs in hot paths
- Suggestions for alternative libraries or configuration changes

**GC pressure:**
- Functions creating many short-lived objects in tight loops
- Large allocations that could be pooled or reused

## Vitest plugin options

```ts
zeitzeuge({
  // Enable/disable the plugin (default: true)
  enabled: true,

  // Path for the Markdown report (default: 'zeitzeuge-report.md')
  output: 'zeitzeuge-report.md',

  // Directory for temporary .cpuprofile files (default: '.zeitzeuge-profiles')
  profileDir: '.zeitzeuge-profiles',

  // Run Deep Agent analysis after tests finish (default: true)
  analyzeOnFinish: true,

  // Project root for classifying application vs dependency code (default: process.cwd())
  projectRoot: process.cwd(),

  // Enable debug logging (default: false)
  verbose: false,
})
```

## CLI options

```
zeitzeuge <url> [options]

Options:
  --verbose, -v   Enable verbose/debug logging       [boolean] [default: false]
  --headless      Run Chrome in headless mode         [boolean] [default: true]
  --timeout       Page load timeout in milliseconds   [number]  [default: 30000]
  --help, -h      Show help                           [boolean]
  --version       Show version number                 [boolean]
```

## Environment variables

| Variable | Description |
|---|---|
| `OPENAI_API_KEY` | OpenAI API key (preferred) |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback) |
| `ZEITZEUGE_MODEL` | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |

## Development

```bash
# Install dependencies
bun install

# Run in development
bun run dev -- http://localhost:3000

# Run tests
bun test

# Build for distribution
bun run build
```

## Tech stack

- **Runtime:** [Bun](https://bun.sh) (works across JS runtimes)
- **Browser automation:** [WebdriverIO](https://webdriver.io) + Chrome DevTools Protocol
- **Runtime tracing:** [CDP Tracing domain](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/) for function-level main-thread analysis
- **V8 CPU profiling:** `--cpu-prof` for per-function timing in test suites
- **AI analysis:** [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview) + [LangChain](https://langchain.com)
- **Virtual filesystem:** [@langchain/node-vfs](https://docs.langchain.com/oss/javascript/integrations/providers/node-vfs) — in-memory VFS sandbox
- **LLM providers:** OpenAI, Anthropic (auto-detected from environment)
