# zeitzeuge

AI-powered frontend performance analysis from the command line. Captures a heap snapshot, performance trace, **and full Chrome runtime trace** from a single page load, stores all assets in a virtual filesystem, and hands everything to a Deep Agent that investigates memory issues, blocking functions, listener leaks, and page-load bottlenecks.

> *"Zeuge" = witness — the tool "witnesses" slowdowns in your test runs.*

## Quick start

```bash
# Set your API key
export OPENAI_API_KEY=sk-...    # or ANTHROPIC_API_KEY

# Analyze any URL
npx zeitzeuge http://localhost:3000
```

## How it works

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

## What it finds

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

**Runtime issues (new in v0.3.0):**
- **Frame-blocking functions** — exact function name, script URL, line number, and call stack for any function blocking the main thread > 50ms
- **Event listener leaks** — `addEventListener` calls without matching `removeEventListener`, growing listener counts
- **GC pressure** — frequent or long garbage collection pauses indicating memory churn
- **Layout thrashing** — forced synchronous layouts from reading layout properties after DOM mutations

## Options

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
- **AI analysis:** [Deep Agents](https://docs.langchain.com/oss/javascript/deepagents/overview) + [LangChain](https://langchain.com)
- **Virtual filesystem:** [@langchain/node-vfs](https://docs.langchain.com/oss/javascript/integrations/providers/node-vfs) — in-memory VFS sandbox
- **LLM providers:** OpenAI, Anthropic (auto-detected from environment)
