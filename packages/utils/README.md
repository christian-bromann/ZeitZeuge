# @zeitzeuge/utils

Shared internal utilities for the zeitzeuge monorepo. This package is **private** and never published to npm -- its code is bundled into consuming packages (`zeitzeuge`, `@zeitzeuge/vitest`) at build time via `bun build --packages external`.

## What's inside

| Module                | Description                                                          |
| --------------------- | -------------------------------------------------------------------- |
| `types.ts`            | Shared TypeScript types (Finding, HeapSummary, TraceResult, metrics) |
| `schema.ts`           | Zod schemas for structured agent output (FindingsSchema)             |
| `models/init.ts`      | LLM initialization (OpenAI / Anthropic auto-detection)               |
| `analysis/agent.ts`   | Deep Agent invocation (`analyze`, `analyzeTestPerformance`)          |
| `analysis/prompts.ts` | System prompt for page-load analysis                                 |
| `output/terminal.ts`  | Terminal formatting (spinners, colored output, findings display)     |
| `output/report.ts`    | Markdown report generation                                           |
| `output/progress.ts`  | Streaming progress renderer for agent todo tracking                  |

## Usage within the monorepo

Other packages import from `@zeitzeuge/utils` as a workspace dependency:

```json
{
  "dependencies": {
    "@zeitzeuge/utils": "workspace:*"
  }
}
```

```ts
import { initModel, analyze, printFindings, type Finding } from '@zeitzeuge/utils';
```

At build time, `bun build --packages external` bundles the utils code **into** the consuming package's output. End users never need to install `@zeitzeuge/utils` separately.

## Development

```bash
# Build
bun run build

# Run tests
bun test
```

## Related packages

- [`zeitzeuge`](../cli/) -- CLI for page-load performance analysis
- [`@zeitzeuge/vitest`](../vitest/) -- Vitest plugin for test suite performance analysis
