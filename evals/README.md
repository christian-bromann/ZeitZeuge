# Zeitzeuge Evaluation Suite

LangSmith-powered evals that measure how well the zeitzeuge Deep Agent detects performance issues. The suite runs the agent against pre-captured CPU profiles and listener-tracking data from the [example project](../example/), then scores the results with five evaluators.

## Quick Start

```bash
# From the repo root
cd evals

# Set required env vars
export ANTHROPIC_API_KEY=sk-ant-...   # or OPENAI_API_KEY
export LANGCHAIN_TRACING_V2=true
export LANGSMITH_API_KEY=lsv2_...

# Run via LangSmith evaluate()
bun run eval

# Or via bun test (includes assertion targets)
bun run eval:test
```

## How It Works

```
evals/dataset/          ─── pre-captured profiles ───▶  build-workspace.ts
  (8 .cpuprofile files,                                      │
   listener-tracking.jsonl)                                   ▼
                                                        run-agent.ts
example/src/**          ─── source code ────────────▶  (Deep Agent)
                                                          │
                                                          ▼
                                                     Finding[]
                                                          │
                                    ┌─────────────────────┼──────────────────────┐
                                    ▼                     ▼                      ▼
                              finding-coverage      finding-quality       no-hallucination
                              severity-accuracy     code-fix-quality
                                    │                     │                      │
                                    └─────────────────────┼──────────────────────┘
                                                          ▼
                                                    LangSmith Dashboard
```

1. **`build-workspace.ts`** reads the static dataset (CPU profiles + listener tracking) and the example project source code, then builds the same VFS workspace the agent sees during a live Vitest run.
2. **`run-agent.ts`** initializes the LLM, passes the workspace to the Deep Agent, and returns an array of `Finding` objects.
3. **Five evaluators** score the findings against 16 known performance flaws defined in `reference-findings.ts`.

## Dataset

`dataset/` contains data captured from a real run of the example project's test suite:

| File                      | Description                                                                     |
| ------------------------- | ------------------------------------------------------------------------------- |
| `CPU.*.cpuprofile` (×8)   | V8 CPU profiles from each Vitest worker process                                 |
| `listener-tracking.jsonl` | Per-process EventTarget/EventEmitter listener add/remove counts and exceedances |
| `_listener-tracker.mjs`   | The ESM preload script that generated the tracking data (reference only)        |

## Evaluators

| Evaluator             | Type          | What it measures                                                                                                                                 |
| --------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Finding Coverage**  | Deterministic | Fraction of 16 known flaws detected, broken down by category (blocking, listener leaks, slow code paths, closure leaks, excessive instantiation) |
| **Finding Quality**   | LLM-as-judge  | Rates each matched finding on accuracy, specificity, actionability, and explanation (1–5 scale)                                                  |
| **Code Fix Quality**  | LLM-as-judge  | Evaluates `beforeCode`/`afterCode` pairs for correctness, drop-in compatibility, and regression safety                                           |
| **Severity Accuracy** | Deterministic | Compares agent severity assignments against expected values (exact = 1.0, one-off = 0.5, two-off = 0.0)                                          |
| **No Hallucination**  | Deterministic | Verifies findings reference real source files, valid line numbers, and actual code snippets                                                      |

## Scoring Targets

Initial benchmarks for tracking improvement over time:

| Metric                    | Target  | Description                                             |
| ------------------------- | ------- | ------------------------------------------------------- |
| `coverage_overall`        | ≥ 60%   | Agent detects at least 60% of known flaws               |
| `coverage_blocking`       | ≥ 80%   | Blocking issues are the most obvious; high bar expected |
| `coverage_listener_leak`  | ≥ 70%   | Listener data is explicitly provided to the agent       |
| `coverage_slow_code_path` | ≥ 50%   | Some slow paths may fall below profiling thresholds     |
| `quality_overall`         | ≥ 3.5/5 | Findings should be specific and actionable              |
| `code_fix_correctness`    | ≥ 70%   | Majority of suggested fixes should be correct           |
| `severity_accuracy`       | ≥ 60%   | Severity should be reasonable for most findings         |
| `hallucination_rate`      | ≤ 10%   | At most 10% of findings reference non-existent code     |

These are soft targets — they serve as benchmarks rather than hard gates.

## Ground Truth

`src/reference-findings.ts` defines 16 known performance flaws across five categories:

| Category                | Count | Examples                                                                          |
| ----------------------- | ----- | --------------------------------------------------------------------------------- |
| Blocking                | 2     | `hashPassword` sync loop, `generateToken` compounding                             |
| Listener Leaks          | 3     | `getAnalytics` listener accumulation, `subscribe` stacking, maxListeners exceeded |
| Slow Code Paths         | 5     | O(n²×m²) tag correlation, unnecessary deep cloning, regex recompilation           |
| Closure Leaks           | 3     | Cache refresher closures, unbounded access log, request tracker closures          |
| Excessive Instantiation | 3     | Per-call `Intl.DateTimeFormat`/`TextEncoder`/`Map`, per-call `RegExp` compilation |

## Environment Variables

| Variable               | Required     | Description                                              |
| ---------------------- | ------------ | -------------------------------------------------------- |
| `ANTHROPIC_API_KEY`    | One of these | Anthropic API key for the agent                          |
| `OPENAI_API_KEY`       | One of these | OpenAI API key for the agent                             |
| `LANGCHAIN_TRACING_V2` | Yes          | Set to `true` to enable LangSmith tracing                |
| `LANGSMITH_API_KEY`    | Yes          | LangSmith API key for experiment tracking                |
| `ZEITZEUGE_MODEL`      | No           | Override the LLM model (e.g. `claude-sonnet-4-20250514`) |

## Project Structure

```
evals/
├── dataset/                        # Pre-captured profiling data
│   ├── CPU.*.cpuprofile            # 8 V8 CPU profiles
│   ├── listener-tracking.jsonl     # Listener tracking data
│   └── _listener-tracker.mjs       # Preload script (reference)
├── src/
│   ├── run-agent.ts                # Target function: invokes the agent pipeline
│   ├── build-workspace.ts          # Builds VFS workspace from dataset
│   ├── reference-findings.ts       # 16 ground truth entries
│   └── evaluators/
│       ├── finding-coverage.ts     # Deterministic coverage scoring
│       ├── finding-quality.ts      # LLM-as-judge quality scoring
│       ├── code-fix-quality.ts     # LLM-as-judge code fix scoring
│       ├── severity-accuracy.ts    # Deterministic severity scoring
│       └── no-hallucination.ts     # Deterministic hallucination check
├── eval.ts                         # Main LangSmith eval runner
├── eval.test.ts                    # Bun test alternative runner
├── package.json
├── tsconfig.json
└── README.md
```
