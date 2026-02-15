# Example Application: Task Manager API

A task management REST API built with Bun that contains **intentional performance issues** for evaluating the [zeitzeuge](../packages/cli) performance analysis tool.

## Setup

```bash
cd example
bun install
```

## Running the Server

```bash
bun run start
```

The server starts at `http://localhost:3456` (override with `PORT` env var).

## API Endpoints

| Method | Endpoint              | Description                                        |
| ------ | --------------------- | -------------------------------------------------- |
| GET    | /api/tasks            | List tasks (supports `?search`, `?status`, `?tag`) |
| POST   | /api/tasks            | Create a new task                                  |
| GET    | /api/tasks/:id        | Get a task by ID                                   |
| PUT    | /api/tasks/:id        | Update a task                                      |
| DELETE | /api/tasks/:id        | Delete a task                                      |
| GET    | /api/analytics        | Compute task analytics                             |
| POST   | /api/auth/hash        | Hash a password (blocking)                         |
| POST   | /api/cache            | Store a value in cache                             |
| GET    | /api/cache/entry/:key | Read a cached value                                |
| GET    | /api/cache/stats      | Cache statistics                                   |
| POST   | /api/notifications    | Send a notification                                |
| GET    | /api/notifications    | Get notification log                               |
| GET    | /api/stats            | Request tracking statistics                        |
| GET    | /api/health           | Health check                                       |

## Embedded Performance Flaws

The application contains five categories of intentional performance issues.

### 1. Blocking / Long-Running Tasks

**Files:** `src/utils/crypto.ts`

- `hashPassword()` uses a synchronous CPU-intensive loop that blocks the event loop. No work can be processed while it runs.
- `generateToken()` calls `hashPassword()` internally, compounding the blocking.
- Neither function uses the async Web Crypto API or `node:crypto` alternatives.

**Symptoms:** Other requests queue up while hash operations execute. `setTimeout` / `setImmediate` callbacks are delayed.

### 2. Event Listener Leaks

**Files:** `src/services/analytics-service.ts`, `src/services/notification-service.ts`

- `getAnalytics()` adds a **new** `task:changed` listener on every call but never removes old ones. After N calls there are N active listeners.
- `subscribe()` adds event listeners without providing an unsubscribe mechanism; repeated subscriptions to the same channel pile up.
- Node's default `maxListeners` threshold (10) is quickly exceeded.

**Symptoms:** Memory growth, `MaxListenersExceededWarning`, slower event dispatch as duplicate handlers fire.

### 3. Slow Code Paths

**Files:** `src/services/analytics-service.ts`, `src/services/task-service.ts`, `src/utils/validators.ts`

- **O(n² × m²) tag correlation** in `computeTagCorrelations()` — compares every pair of tasks and every pair of their tags.
- **Unnecessary deep cloning** — `getAllTasks()` and `getTask()` serialize the entire result via `JSON.parse(JSON.stringify(...))` on every read.
- **O(n²) duplicate check** — `validateTags()` runs `.filter()` over the whole array for each element.
- **Regex recompilation** — `validateTaskTitle()` and `validateEmail()` compile new `RegExp` objects on every call instead of reusing module-level constants.
- **Expensive sort comparator** — `computePriorityWeight()` constructs `Date` objects and performs string operations on every comparison.

**Symptoms:** Response times degrade quadratically as data grows.

### 4. Closures Not Garbage Collected

**Files:** `src/services/cache-service.ts`, `src/middleware/request-tracker.ts`

- Cache entries store `refresher` closures that capture the full `value` and `requestContext` from the enclosing scope — even after the data is conceptually stale, the references live on.
- Cache access logs grow without bounds, retaining full request contexts.
- The request tracker stores `getDetails` closures that capture the original request body.
- **No eviction, TTL, or cleanup mechanism** exists in either module.

**Symptoms:** Heap grows continuously. Old request data is never freed. `process.memoryUsage().heapUsed` rises monotonically.

### 5. Excessive Instantiation

**Files:** `src/services/notification-service.ts`, `src/utils/crypto.ts`, `src/utils/validators.ts`

- `sendNotification()` creates a **new** `Intl.DateTimeFormat`, `TextEncoder`, and `Map` on every call — all stateless and safely reusable.
- `hashPassword()` allocates a `TextEncoder` per invocation.
- Validators compile `RegExp` patterns on every function call.
- `computePriorityWeight()` creates `Date` objects inside a sort comparator (called O(n log n) times).

**Symptoms:** GC pressure, longer minor GC pauses, higher allocation rate visible in heap snapshots.

## Running Tests

```bash
bun run test
```

The test suite is organized into five files mirroring the flaw categories:

| File                            | Detects                               |
| ------------------------------- | ------------------------------------- |
| `tests/blocking.test.ts`        | Event-loop-blocking synchronous work  |
| `tests/event-listeners.test.ts` | Listener accumulation on EventEmitter |
| `tests/memory-leaks.test.ts`    | Unbounded growth of caches and logs   |
| `tests/slow-paths.test.ts`      | Super-linear algorithmic complexity   |
| `tests/instantiation.test.ts`   | Redundant object construction         |

Each test uses timing measurements (`performance.now()`), listener counting (`EventEmitter.listenerCount()`), or memory monitoring (`process.memoryUsage()`) to surface the issues programmatically.
