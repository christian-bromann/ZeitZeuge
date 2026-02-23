# @zeitzeuge/bun

AI-powered performance analysis for [Bun](https://bun.sh) test suites. Captures CPU profiles during `bun test`, correlates hot functions with your application code, and runs a Deep Agent to produce actionable optimization suggestions.

> _"Zeuge" = witness — the tool "witnesses" slowdowns in your test suite._

## Installation

```bash
bun add @zeitzeuge/bun
```

Requires an LLM API key:

```bash
export OPENAI_API_KEY=sk-...    # or ANTHROPIC_API_KEY
```

## Quick start

**1. Run tests with the zeitzeuge preload script:**

```bash
bun test --preload @zeitzeuge/bun/preload
```

**2. Analyze the results:**

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

### Recommended: on-demand profiling

Add a dedicated script so normal test runs stay fast and free of charge:

```json
{
  "scripts": {
    "test": "bun test",
    "test:profile": "bun scripts/profile-tests.ts"
  }
}
```

```bash
bun test                # regular run — no profiling, no LLM cost
bun run test:profile    # profiles tests + generates AI report
```

### bunfig.toml

Alternatively, configure the preload script in `bunfig.toml`:

```toml
[test]
preload = ["@zeitzeuge/bun/preload"]
```

## Options

```ts
await analyzeTestRun({
  enabled: true, // enable/disable analysis
  output: 'zeitzeuge-report.md', // path for the Markdown report
  profileDir: '.zeitzeuge-profiles', // directory for temporary profile files
  analyzeOnFinish: true, // run Deep Agent analysis
  projectRoot: process.cwd(), // project root for classifying code
  verbose: false, // enable debug logging
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

## How it works

1. **Preload script captures timing** — injected via `--preload`, it uses Bun's test lifecycle hooks (`afterEach`/`afterAll`) to record per-test timing data
2. **V8-compatible CPU profiles** — Bun generates `.cpuprofile` files in the same V8 format used by Node.js
3. **Correlates profiles with test files** — profiles are matched to test files by execution order
4. **Classifies hot functions** — every profiled function is categorized as `application`, `dependency`, `test`, or `framework`
5. **Deep Agent analyzes your application code** — focuses on bottlenecks in the code you wrote, not test infrastructure overhead

## Exports

```ts
import { analyzeTestRun, parseBunProfile, classifyScript } from '@zeitzeuge/bun';
import type { ZeitZeugeBunTestOptions, JSCProfile, JSCProfileNode } from '@zeitzeuge/bun';
```

## Environment variables

| Variable            | Description                                                     |
| ------------------- | --------------------------------------------------------------- |
| `OPENAI_API_KEY`    | OpenAI API key (preferred)                                      |
| `ANTHROPIC_API_KEY` | Anthropic API key (fallback)                                    |
| `ZEITZEUGE_MODEL`   | Override model name (e.g. `gpt-4o`, `claude-sonnet-4-20250514`) |

## Requirements

- Bun >= 1.0
- An LLM API key (`OPENAI_API_KEY` or `ANTHROPIC_API_KEY`)

## Related packages

- [`zeitzeuge`](../cli/) — CLI for page-load performance analysis
- [`@zeitzeuge/vitest`](../vitest/) — Vitest plugin for test suite performance analysis
- [`@zeitzeuge/utils`](../utils/) — Shared internals (private, not published)

## License

MIT
