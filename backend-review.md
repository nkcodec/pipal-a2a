# Pipal-A2A Backend Code Review

**Date:** 2026-05-20  
**Reviewer:** Code Review Agent  
**Scope:** All source files under `src/`, `tests/`, `config/`

---

## Executive Summary

| Severity | Count |
|----------|-------|
| CRITICAL | 4     |
| HIGH     | 8     |
| MEDIUM   | 9     |
| LOW      | 7     |
| **Total** | **28** |

**CRITICAL + HIGH = 12 issues** requiring immediate attention before production use.

The project implements a P2P agent networking layer on top of Google's A2A v1.0 protocol with a clean layered architecture (core → sdk → application → infrastructure → extension). The protocol types and factory functions in `src/core/types.ts` are well-designed and immutable. However, there are significant security vulnerabilities (unsafe YAML parsing, SSRF, input injection), reliability risks (TOCTOU races, unbounded memory growth), and logic errors that should be addressed.

---

## CRITICAL Issues

### C-1: Arbitrary Code Execution via Unsafe YAML Parsing

- **File:** `src/extension/index.ts`
- **Lines:** 100, 132 (in `loadConfig` and `loadTeamRoles`)
- **Description:** `js-yaml`'s `load()` function uses `DEFAULT_FULL_SCHEMA` by default, which allows `!!js/function`, `!!js/regexp`, and `!!js/undefined` YAML tags. A malicious `config/pipal-a2a.yaml` or `config/team.yaml` file (e.g., from a cloned repo) can execute arbitrary JavaScript during parsing. This is a supply-chain attack vector — if someone clones a repo with a crafted YAML, the extension will execute attacker-controlled code.
- **Code:**
  ```typescript
  // VULNERABLE — uses DEFAULT_FULL_SCHEMA
  config = load(content) as ExtensionConfig;
  ```
- **Fix:** Use `yaml.load(content, { schema: yaml.DEFAULT_SAFE_SCHEMA })` or switch to the `yaml` package (from `yamljs`) which is safe by default:
  ```typescript
  import { load } from 'js-yaml';
  config = load(content, { schema: DEFAULT_SAFE_SCHEMA }) as ExtensionConfig;
  ```

### C-2: Server-Side Request Forgery (SSRF) via Push Notification Webhooks

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `firePushWebhook()` method (~line 135-160)
- **Description:** Any agent can register a push notification config with an arbitrary URL. The server then makes HTTP POST requests to those URLs with no validation. An attacker can target internal network services (e.g., `http://169.254.169.254/latest/meta-data` for cloud metadata, `http://localhost:6379` for Redis, etc.). Additionally, the `authentication.credentials` field allows the attacker to capture bearer tokens by pointing the webhook at their own server — the server will include the credentials in the `Authorization` header.
- **Fix:** 
  1. Validate webhook URLs against an allowlist of domains/schemes.
  2. Block RFC 1918, link-local, and loopback addresses.
  3. Never forward user-provided credentials in outgoing requests.

### C-3: SSE Injection via Crafted Client ID

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** SSE setup in `setupSseRoutes()` (~line 310, 340)
- **Description:** The `clientId` query parameter is directly interpolated into the SSE response body without sanitization:
  ```typescript
  res.write(`event: connected\ndata: {"clientId":"${clientId}"}\n\n`);
  ```
  An attacker can inject arbitrary SSE events by crafting a clientId containing newlines and SSE protocol characters:
  ```
  GET /events?clientId=x"\ndata:{"role":"admin"}\nevent:task:completed\ndata:{"injected":true}\n//
  ```
  This allows injection of fake events into the SSE stream, potentially causing agents to process fraudulent task results.
- **Fix:** Sanitize or validate `clientId` before interpolation. Use JSON.stringify for the entire payload:
  ```typescript
  res.write(`event: connected\ndata: ${JSON.stringify({ clientId })}\n\n`);
  ```

### C-4: Unbounded Memory Growth — No Task/Agent Cleanup

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** Class fields `agents`, `tasks`, `pushConfigs`, `sseClients`, `taskStreams`
- **Description:** All data structures (`Map<string, AgentCard>`, `Map<string, StoredTask>`, etc.) grow indefinitely. Completed tasks are never pruned. Disconnected SSE clients that fail to emit `close` events leak `Response` objects with their heartbeat intervals. In a long-running shared state server, this will eventually cause OOM crashes. The heartbeat intervals alone (one per SSE client, firing every 15s) can accumulate significant CPU overhead.
- **Fix:**
  1. Add a TTL-based cleanup job for completed tasks (e.g., prune tasks older than 1 hour).
  2. Add periodic SSE client liveness checks (ping/pong or write-error detection).
  3. Limit the maximum number of stored tasks and registered agents.

---

## HIGH Issues

### H-1: Race Condition in HOST/JOIN Detection (TOCTOU)

- **File:** `src/extension/index.ts`
- **Lines:** Inside `session_start` handler
- **Description:** The extension checks `client.isReachable()` and, if unreachable, starts a new server. Between the check and the `server.start()` call, another terminal could have started its own server, causing an `EADDRINUSE` error. This is a classic Time-of-Check-Time-of-Use race.
  ```typescript
  const isHost = !(await client.isReachable());
  if (isHost) {
    server = new SharedStateServer();
    await server.start(parsedPort); // Can fail with EADDRINUSE
  }
  ```
- **Fix:** Wrap the check+start in a try/catch. If `EADDRINUSE` is thrown, fall back to JOIN mode:
  ```typescript
  if (isHost) {
    try {
      server = new SharedStateServer();
      await server.start(parsedPort);
    } catch (err: any) {
      if (err.code === 'EADDRINUSE') {
        console.log('[pipal-a2a] Server already started — joining');
        server = null;
      } else throw err;
    }
  }
  ```

### H-2: No Request Body Size Limit

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `this.app.use(express.json())`
- **Description:** `express.json()` is used without a size limit. An attacker (or misbehaving agent) can send a multi-GB JSON body, consuming all available memory and crashing the server. Default Express body limit is 100kb, but this depends on the version and configuration.
- **Fix:** Explicitly set a limit: `express.json({ limit: '1mb' })`.

### H-3: Unsafe Type Assertions Without Validation on RPC Input

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** All RPC handlers (e.g., `tasks/sendMessage`, `tasks/resolveTask`)
- **Description:** RPC params are cast with `as` assertions without runtime validation:
  ```typescript
  const { task, skill, to, id: reqId, contextId } = params as {
    task?: string; skill?: string; ...
  };
  ```
  If the client sends non-string values (e.g., `task: { malicious: true }`), they pass through unchecked. The `taskDescription` field is sliced without length checks. Malformed input could cause unexpected behavior or crashes.
- **Fix:** Add runtime validation for all RPC params using a schema library (zod, typebox) or manual checks before destructuring.

### H-4: SmartRouter `select()` Signature Mismatch with Interface

- **File:** `src/builtin/smart-router.ts` vs `src/sdk/index.ts`
- **Lines:** `SmartRouter.select()` has extra `excludeSelf` parameter
- **Description:** The `RoutingStrategy` interface defines:
  ```typescript
  select(task: Task, candidates: AgentCard[]): AgentCard | undefined;
  ```
  But `SmartRouter.select()` adds an optional third parameter:
  ```typescript
  select(task: Task, candidates: AgentCard[], excludeSelf?: string): AgentCard | undefined;
  ```
  This violates the interface contract. The `excludeSelf` parameter is only used when `SmartRouter` is called directly (not through the interface), bypassing the routing strategy abstraction. TypeScript allows this due to structural typing, but it creates a hidden dependency.
- **Fix:** Either add `excludeSelf` to the `RoutingStrategy` interface or use a wrapper/factory pattern to inject self-exclusion.

### H-5: cancelTask Returns Error as Result, Not as JSON-RPC Error

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `tasks/cancelTask` handler
- **Description:** When a task is already completed, the handler returns `{ error: { code, message } }` as the `result` field, not as a JSON-RPC error:
  ```typescript
  return {
    error: {
      code: JSONRPC_CODES.TASK_NOT_CANCELABLE,
      message: `Task '${taskId}' is already completed`,
    },
  };
  ```
  This gets wrapped as `{ jsonrpc: "2.0", id: ..., result: { error: { ... } } }`, which is NOT a valid JSON-RPC error response. Clients checking `response.error` will miss it.
- **Fix:** Throw the error so the dispatcher catches it and returns a proper JSON-RPC error response:
  ```typescript
  throw { code: JSONRPC_CODES.TASK_NOT_CANCELABLE, message: `Task '${taskId}' is already completed` };
  ```

### H-6: Potential Unhandled Promise Rejection in SSE Subscribe

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `SharedStateClient.subscribe()` method
- **Description:** The `connect()` async function is fired without awaiting it:
  ```typescript
  const connect = async () => { /* ... */ };
  connect(); // Fire-and-forget
  ```
  If `connect()` throws an unhandled error (e.g., network error before the try/catch), it becomes an unhandled promise rejection, which can crash Node.js in strict mode.
- **Fix:** Add a `.catch(() => {})` or log the error explicitly.

### H-7: No Task State Machine Validation

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `tasks/resolveTask` handler
- **Description:** The `resolveTask` RPC handler allows transitioning from ANY state to ANY final state. There's no validation that the transition is legal per the A2A spec. For example:
  - A `TASK_STATE_COMPLETED` task can be re-resolved to `TASK_STATE_FAILED`
  - A `TASK_STATE_CANCELED` task can be resolved to `TASK_STATE_COMPLETED`
  - An already `TASK_STATE_FAILED` task can be re-resolved
- **Fix:** Add state transition validation:
  ```typescript
  const terminalStates = new Set(['TASK_STATE_COMPLETED', 'TASK_STATE_FAILED', 'TASK_STATE_CANCELED']);
  if (terminalStates.has(task.status.state)) {
    throw { code: -32603, message: `Task already in terminal state: ${task.status.state}` };
  }
  ```

### H-8: Quiescence Timer Fires After Session Shutdown

- **File:** `src/extension/index.ts`
- **Lines:** `resetQuiescenceTimer()` and `session_shutdown` handler
- **Description:** The 15-second quiescence timer is not cleared during `session_shutdown`. If the timer fires after shutdown, `postDelegatedResult()` attempts to use a potentially null `client`, causing unhandled errors.
- **Fix:** Clear the timer in the `session_shutdown` handler:
  ```typescript
  pi.on("session_shutdown", async () => {
    if (resultTimer) { clearTimeout(resultTimer); resultTimer = null; }
    // ... rest of shutdown
  });
  ```

---

## MEDIUM Issues

### M-1: SmartRouter Creates New Instance Per Delegation Call

- **File:** `src/extension/index.ts`
- **Lines:** Inside `pipal_a2a_delegate` tool execute
- **Description:** Every call to the delegate tool creates `new SmartRouter()`, which reads and parses `config/team.yaml` from disk on each invocation. This is wasteful I/O and inconsistent with the `SmartRouter` used by the `DefaultTaskRouter`.
- **Fix:** Reuse the existing `router` instance or cache the `SmartRouter`.

### M-2: Fragile Custom YAML Parser in SmartRouter

- **File:** `src/builtin/smart-router.ts`
- **Lines:** `parseYaml()` method
- **Description:** The custom YAML parser is extremely fragile — it requires exact 2-space indentation for roles, only handles single-line values, and silently produces empty/wrong results on any deviation (tabs, 4-space indent, multi-line descriptions, nested objects). This will cause silent routing failures.
- **Fix:** Use `js-yaml` (with safe schema) for parsing, or validate the parsed output has expected fields.

### M-3: Single-Task Concurrency Limit

- **File:** `src/extension/index.ts`
- **Lines:** `currentDelegatedTaskId` module-level variable
- **Description:** The extension uses a single `currentDelegatedTaskId` variable, meaning an agent can only process one delegated task at a time. If a second task arrives while the first is being processed, it's rejected with "Agent busy." This limits throughput and is problematic for long-running tasks.
- **Fix:** Use a task queue with configurable concurrency.

### M-4: `broadcastToTask` Writes to Potentially Closed Responses

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `broadcastToTask()` method
- **Description:** SSE responses may have been closed by the client or network between the time they were registered and when a broadcast is sent. `res.write()` on a closed socket throws `ERR_STREAM_WRITE_AFTER_END`. The debug logging also runs on every broadcast, which is noisy.
- **Fix:** Wrap `res.write()` in try/catch and remove the dead client on error.

### M-5: No CORS Configuration

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** Server setup
- **Description:** The Express server has no CORS headers configured. If the frontend or any browser-based tool needs to call the API, it will be blocked. Conversely, without CORS, there's no protection against cross-origin requests if that's desired.
- **Fix:** Add `cors()` middleware if browser access is needed, or explicitly reject cross-origin requests.

### M-6: AgentCard URL Not Validated on Registration

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `POST /register` handler
- **Description:** The AgentCard's `supportedInterfaces[].url` field is not validated. An agent can register with any URL, potentially pointing to a malicious endpoint. Other agents routing tasks to this agent will communicate with the attacker's server.
- **Fix:** Validate that registered URLs are well-formed and, optionally, reachable.

### M-7: `discover()` Returns All Cards, Not the Server's Own Card

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `GET /.well-known/agent-card.json` handler
- **Description:** The Google A2A spec §8 states that `/.well-known/agent-card.json` should return the agent's own card. Here it returns ALL registered agents as an array. This is a protocol deviation that may break spec-compliant clients.
- **Fix:** Either return the server's own card (if it has one) or document this as a P2P extension.

### M-8: Incomplete Task State Handling in cancelTask

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `tasks/cancelTask` handler
- **Description:** Only `TASK_STATE_COMPLETED` is checked as non-cancelable. Per the A2A spec, `TASK_STATE_FAILED` and `TASK_STATE_CANCELED` should also be non-cancelable.
- **Fix:** Check all terminal states.

### M-9: Agent Endpoint Path Traversal

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `GET /agents/:name` and `GET /push-configs/:id`
- **Description:** Route parameters `req.params.name` and `req.params.id` are used directly as Map keys. While `Map.get()` is safe from injection, the `push-configs/:id` response includes `req.params.id` in the response body, which could reflect attacker input. Express route params are generally safe from path traversal, but the lack of validation means unexpected characters can be used.
- **Fix:** Validate route params with a regex (e.g., `/^[a-zA-Z0-9-]+$/`).

---

## LOW Issues

### L-1: Pervasive `any` Types in Extension

- **File:** `src/extension/index.ts`
- **Lines:** Throughout (event handlers, message parsing)
- **Description:** Almost all event handlers use `any` for event data: `(event: string, data: any)`, `(event: any)`, etc. This defeats TypeScript's type safety and makes refactoring risky.
- **Fix:** Define proper types for SSE events and pi lifecycle events.

### L-2: Protocol Compliance Check Creates Unused Instance at Module Load

- **File:** `src/application/registry.ts`, `src/application/router.ts`, `src/builtin/skill-matcher.ts`
- **Lines:** Bottom of each file
- **Description:** Each file creates a throwaway instance for type checking:
  ```typescript
  const _registry: AgentRegistryType = new InMemoryAgentRegistry();
  ```
  This creates side effects at import time and wastes memory.
- **Fix:** Remove these or use `satisfies` with a type annotation on the class itself.

### L-3: Debug Logging in Production Path

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `broadcastToTask()` method
- **Description:** Verbose `console.log` calls run on every broadcast, including per-stream matching details. This is excessive for production and will fill logs quickly.
- **Fix:** Use a configurable log level or remove per-stream debug logs.

### L-4: Port Auto-Hash Can Collide

- **File:** `src/extension/index.ts`
- **Lines:** Auto-port calculation in `loadConfig()`
- **Description:** `5000 + (Math.abs(hash) % 100)` gives only 100 possible ports (5000-5099). Two different CWDs can hash to the same port, causing unexpected server collisions.
- **Fix:** Use a wider range or a more robust hash function.

### L-5: `listTasks` with Empty Agent Name Returns All

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `tasks/listTasks` handler
- **Description:** When `agentName` is an empty string (which it can be from the client sending `""`), the filter falls through and returns ALL tasks. This could leak tasks between agents.
- **Fix:** Only filter when `agentName` is truthy (not just defined).

### L-6: `sendFollowUp` State Transition Logic is Incomplete

- **File:** `src/infrastructure/shared-state.ts`
- **Lines:** `tasks/addMessage` handler
- **Description:** The state transition logic only handles `INPUT_REQUIRED → WORKING` when `role === "ROLE_USER"`. Other transitions (e.g., from `SUBMITTED` to `WORKING` on first message) are not handled, leaving the task in `SUBMITTED` state even after messages are exchanged.
- **Fix:** Implement a proper state machine with all valid transitions.

### L-7: Hardcoded Timeout Values

- **File:** `src/extension/index.ts`, `src/infrastructure/shared-state.ts`
- **Lines:** Multiple locations
- **Description:** Timeouts are hardcoded as magic numbers: `120_000` (task timeout), `15_000` (quiescence), `3_000` (health check), `15_000` (heartbeat). These should be configurable.
- **Fix:** Extract to named constants or configuration.

---

## Positive Observations

1. **Excellent layered architecture** — Clean separation between core (pure types), SDK (interfaces), application (coordination), infrastructure (transport), and extension (lifecycle). Dependencies flow inward correctly.

2. **Immutable core types** — All factory functions use `Object.freeze()` deeply, preventing accidental mutation of protocol objects. Tests verify this.

3. **Protocol compliance** — The AgentCard, Task, and related types closely follow Google A2A v1.0 spec. The JSON-RPC 2.0 binding with error codes is well-implemented.

4. **Good test coverage** — 11 test files covering core types, registry, router, smart router, shared state server/client, e2e routing, push notifications, and tag-based integration. Auth tests verify both positive and negative cases.

5. **SDK design** — The SDK exports only types, never implementations. This is a clean pattern that prevents coupling.

6. **Graceful degradation** — SmartRouter falls back gracefully when no config is available. The client's `isReachable()` health check is a good pattern.

7. **SSE streaming with delta chunks** — The streaming architecture (task → SSE events → accumulated chunks) is well-designed for real-time collaboration.

---

## Priority Remediation Order

1. **C-1** (Unsafe YAML) — Immediate, one-line fix
2. **C-3** (SSE injection) — Immediate, one-line fix
3. **H-5** (cancelTask error format) — Quick fix
4. **H-8** (Timer cleanup) — Quick fix
5. **H-1** (TOCTOU race) — Add try/catch fallback
6. **H-2** (Body size limit) — One-line fix
7. **H-7** (State machine) — Add validation
8. **C-2** (SSRF) — Requires URL allowlist
9. **C-4** (Memory growth) — Requires cleanup job
10. Remaining issues in order of impact
