---
title: CLI
description: Analyze any URL with a single command — captures heap snapshots, performance traces, and runtime traces.
order: 1
---

# CLI

Analyze frontend performance of any URL with a single command.

## Installation

```bash
npm install -g zeitzeuge
# or run directly without installing
npx zeitzeuge <url>
```

## Usage

```bash
zeitzeuge <url> [options]
```

## Options

| Option       | Alias | Type    | Default               | Description                         |
| ------------ | ----- | ------- | --------------------- | ----------------------------------- |
| `--verbose`  | `-v`  | boolean | `false`               | Enable verbose/debug logging        |
| `--headless` | —     | boolean | `true`                | Run Chrome in headless mode         |
| `--timeout`  | —     | number  | `30000`               | Page load timeout in milliseconds   |
| `--output`   | `-o`  | string  | `zeitzeuge-report.md` | Output path for the Markdown report |
| `--help`     | `-h`  | boolean | —                     | Show help                           |
| `--version`  | —     | boolean | —                     | Show version number                 |

## Environment Variables

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key (preferred)                                      |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback)                                    |
| `ZEITZEUGE_MODEL`   | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |

## How It Works

1. **Launches Chrome** via WebdriverIO with DevTools Protocol access
2. **Captures everything in one page load:**
   - V8 heap snapshot (memory analysis)
   - Performance trace (network waterfall, long tasks, paint timing)
   - Chrome runtime trace via the Tracing domain — every function call, event dispatch, layout, paint, and GC event on the main thread
   - All network assets (scripts, CSS, HTML source code)
3. **Builds a VFS workspace** using `@langchain/node-vfs` — an in-memory virtual filesystem containing parsed heap data, trace summaries, runtime analysis, and actual source files
4. **Deep Agent explores** — a LangChain Deep Agent autonomously browses the workspace, reads actual source code, greps for patterns, and correlates heap data with trace data and runtime analysis
5. **Reports findings** — memory leaks, frame-blocking functions, listener leaks, render-blocking scripts — with code-level fixes. A Markdown report is written to disk.

## What It Finds

### Memory Issues

- Memory leaks (unbounded caches, growing arrays/maps)
- Detached DOM nodes still referenced in JavaScript
- Large retained objects and closure leaks

### Page-Load Issues

- Render-blocking scripts (`<script>` without `async`/`defer`)
- Render-blocking stylesheets
- Long main-thread tasks (> 50ms)
- Oversized bundles and unused code
- Sequential waterfall bottlenecks

### Runtime Issues

- **Frame-blocking functions** — exact function name, script URL, line number, and call stack for any function blocking the main thread > 50ms
- **Event listener leaks** — `addEventListener` calls without matching `removeEventListener`, growing listener counts
- **GC pressure** — frequent or long garbage collection pauses indicating memory churn
- **Layout thrashing** — forced synchronous layouts from reading layout properties after DOM mutations
