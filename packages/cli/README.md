# zeitzeuge

AI-powered performance analysis for frontend page loads. Launches Chrome, captures V8 heap snapshots, performance traces, and Chrome runtime traces in a single page load, then hands everything to a Deep Agent that investigates bottlenecks and provides code-level fixes.

> _"Zeuge" = witness -- the tool "witnesses" slowdowns in your page loads._

## Install

```bash
npm install -g zeitzeuge
```

Requires an LLM API key:

```bash
export OPENAI_API_KEY=sk-...    # or ANTHROPIC_API_KEY
```

## Usage

```bash
zeitzeuge http://localhost:3000
```

A Markdown report is written to `zeitzeuge-report.md` with findings and suggested fixes.

## How it works

1. **Launches Chrome** via WebdriverIO with DevTools Protocol access
2. **Captures everything in one page load:**
   - V8 heap snapshot (memory analysis)
   - Performance trace (network waterfall, long tasks, paint timing)
   - Chrome runtime trace via the [Tracing domain](https://chromedevtools.github.io/devtools-protocol/tot/Tracing/) -- every function call, event dispatch, layout, paint, and GC event on the main thread
   - All network assets (scripts, CSS, HTML source code)
3. **Builds a VFS workspace** using `@langchain/node-vfs` containing parsed heap data, trace summaries, runtime analysis, and actual source files
4. **Deep Agent explores** -- a LangChain Deep Agent autonomously browses the workspace, reads source code, and correlates heap data with trace and runtime data
5. **Reports findings** -- memory leaks, frame-blocking functions, listener leaks, render-blocking scripts, GC pressure -- with code-level fixes

## What it finds

- **Memory issues** -- leaks, detached DOM nodes, large retained objects, closure leaks
- **Page-load issues** -- render-blocking scripts/stylesheets, long tasks, oversized bundles, sequential waterfalls
- **Runtime issues** -- frame-blocking functions (with exact source location and call stack), event listener leaks, GC pressure, layout thrashing

## CLI options

```text
zeitzeuge <url> [options]

Options:
  --verbose, -v   Enable verbose/debug logging       [boolean] [default: false]
  --headless      Run Chrome in headless mode         [boolean] [default: true]
  --timeout       Page load timeout in milliseconds   [number]  [default: 30000]
  --output, -o    Output path for the Markdown report [string]  [default: "zeitzeuge-report.md"]
  --help, -h      Show help                           [boolean]
  --version       Show version number                 [boolean]
```

## Environment variables

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key (preferred)                                      |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback)                                    |
| `ZEITZEUGE_MODEL`   | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |

## Related packages

- [`@zeitzeuge/vitest`](../vitest/) -- Vitest plugin for test suite performance analysis
- [`@zeitzeuge/utils`](../utils/) -- Shared internals (private, not published)

## License

MIT
