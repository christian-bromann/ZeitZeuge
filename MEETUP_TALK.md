# Meetup Talk: Zeitzeuge — Building a Performance Analysis Agent with Deep Agents

**Event:** [LangChain Meetup](https://luma.com/g8pxvf6u?tk=8opFs0)

---

## Talk Title

**"Shipping an AI Performance Detective: Building, Evaluating, and Sandboxing a Deep Agent That Finds Your Slowdowns"**

---

## Abstract

Performance profiling tools give you data — flame graphs, heap snapshots, CPU profiles — but making sense of that data still requires an expert. Zeitzeuge is an open-source AI agent that does the expert part for you: it captures V8 heap snapshots, Chrome runtime traces, and CPU profiles from your frontend page loads or Vitest test suites, drops everything into a virtual filesystem, and turns a Deep Agent loose to investigate bottlenecks and produce code-level fixes.

In this talk, we'll walk through how we built Zeitzeuge using LangChain's `createDeepAgent`, how we structured an orchestrator-plus-subagent architecture to divide performance analysis into specialized domains, and the practical lessons we learned making the agent actually reliable — from prompt engineering and skill injection to building a comprehensive eval suite with LangSmith. We'll also demo the agent live, showing how it autonomously navigates a sandboxed VFS workspace, reads source code, correlates profiling data, and outputs actionable findings.

---

## Talk Description

### 1. The Problem: Data Rich, Insight Poor

Modern browsers and runtimes give us incredible profiling primitives — V8 CPU profiles, heap snapshots, Chrome's Tracing domain — but interpreting them is a specialized skill. Most developers see a flame graph and freeze. We wanted to build a tool where you run `npx zeitzeuge http://localhost:3000` or add a Vitest plugin, and get back a Markdown report that says *"Your `hashPassword` function blocks the main thread for 200ms — here's a before/after fix."*

### 2. Architecture: Deep Agent with Specialized Subagents

We'll walk through how Zeitzeuge uses `createDeepAgent` from the `deepagents` package to build a two-tier agent architecture:

- **Orchestrator agent** — receives the high-level task and dispatches work to specialized subagents in parallel
- **Specialized subagents** — each focused on a specific class of performance issue:
  - `cpu-hotspot` — blocking operations, event-loop stalls, excessive instantiation
  - `listener-leak` — event listener add/remove imbalances
  - `memory-closure` — closure-captured leaks, unbounded data structures
  - `code-pattern` — O(n²) algorithms, regex recompilation, unnecessary serialization
  - `page-load` / `runtime-blocking` / `memory-heap` — for browser page-load analysis

Each subagent gets its own system prompt with domain expertise and a set of **skills** (pre-built analysis scripts the agent can invoke) that encode our performance analysis knowledge.

### 3. Sandboxing: The Agent Lives in a Virtual Filesystem

A key design decision: the agent never touches the real filesystem. We use `@langchain/node-vfs` to build an in-memory virtual filesystem containing:

- Parsed profiling data (heap summaries, CPU hotspots, listener tracking)
- Actual source code files referenced by the profiles
- Pre-built analysis skills the agent can execute

The agent's tools — `read_file`, `ls`, `grep`, `glob`, `execute_command` — all operate inside this sandbox. This makes the agent safe to run on any codebase and completely reproducible for evals.

### 4. Making It Reliable: Evals with LangSmith

An agent that works "most of the time" isn't shippable. We'll share the eval framework we built:

- **Reference findings** — 16 hand-crafted ground-truth performance flaws planted in an example project (blocking loops, listener leaks, closure captures, O(n²) sorts)
- **Five evaluators**, each measuring a different quality dimension:
  - `finding-coverage` — deterministic 2-of-3 matching (source file + category + keywords) measuring what fraction of known flaws the agent detects
  - `finding-quality` — LLM-as-judge scoring accuracy, specificity, actionability, and explanation on a 1–5 scale
  - `code-fix-quality` — LLM-as-judge evaluating whether the before/after code suggestions are correct
  - `severity-accuracy` — does the agent assign the right severity level?
  - `no-hallucination` — does the agent reference real files and paths, or make things up?
- **Concrete targets** we hold ourselves to: ≥80% overall coverage, ≥4/5 quality score, ≤10% hallucination rate
- **LangSmith integration** — `evaluate()` from `langsmith/evaluation` runs the full pipeline, tracks experiments over time, and makes regressions visible across prompt or model changes

We'll show the LangSmith dashboard and discuss which metrics moved (and which didn't) as we iterated on prompts, subagent structure, and skill design.

### 5. Live Demo

We'll run Zeitzeuge against a page with deliberate performance problems and watch the agent:

1. Capture a heap snapshot, performance trace, and Chrome runtime trace
2. Build the VFS workspace
3. Dispatch subagents that autonomously read source code, correlate profiling data, and write findings
4. Produce a Markdown report with specific, actionable fixes

---

## Key Takeaways

- **`createDeepAgent` enables real autonomy** — the orchestrator + subagent pattern lets you divide complex analysis domains into specialized agents that work in parallel, each with tailored prompts and skills
- **Sandboxing is non-negotiable** — a VFS backend makes your agent safe, reproducible, and eval-friendly; the agent thinks it's browsing a real filesystem but can't cause harm
- **Evals are how you ship** — without a ground-truth dataset and multi-dimensional evaluators (coverage, quality, hallucination), you're guessing whether your agent works; LangSmith makes this trackable over time
- **Skills bridge the gap** — pre-built analysis scripts injected into the agent workspace let you encode domain expertise without bloating prompts; the agent discovers and uses them autonomously

---

## Speaker Bio

*[Your name and bio here]*

---

## Format

- **Duration:** 20–30 minutes (adjust based on slot)
- **Structure:** Architecture walkthrough (10 min) → Eval deep-dive (10 min) → Live demo (5–10 min)
- **Level:** Intermediate — assumes familiarity with LLMs and LangChain basics
