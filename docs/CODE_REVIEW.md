# Code Review Report — pipal-a2a v0.3.1

**Date:** 2026-05-22
**Reviewers:** security, backend, reviewer agents
**Scope:** All `src/` files
**Tests:** 145 passing

---

## CRITICAL (fix now)

### C-1: Server binds to 0.0.0.0 (network exposure)
- **File:** `src/infrastructure/shared-state.ts:117`
- `app.listen(port)` defaults to all interfaces. Combined with zero-auth default, the entire agent network is exposed.
- **Fix:** `app.listen(port, "127.0.0.1")`

### C-2: Zero-auth default when no API keys configured
- **File:** `src/infrastructure/shared-state.ts:142-143`
- `if (this.validApiKeys.size === 0) { next(); return; }` — allows ALL requests through.
- **Fix:** Bind to 127.0.0.1 (makes C-1 fix sufficient) or require at least one key.

---

## HIGH (fix before release)

### H-1: js-yaml DEFAULT_SCHEMA allows RCE
- **File:** `src/extension/index.ts:108`
- `load(content, { schema: DEFAULT_SCHEMA })` enables `!!js/function` — arbitrary code execution via malicious YAML.
- **Fix:** Use `JSON_SCHEMA`: `import { load, JSON_SCHEMA } from "js-yaml"`

### H-2: Agent identity impersonation
- **File:** `src/infrastructure/shared-state.ts:~196`
- POST `/register` with any name overwrites existing agent. No verification.
- **Fix:** Reject if name already taken, or use session tokens.

### H-3: SSRF — loopback and private IPs not blocked
- **File:** `src/infrastructure/shared-state.ts:61-86`
- Blocks `169.254.169.254` but NOT `127.0.0.1`, `10.x`, `172.16.x`, `192.168.x`.
- **Fix:** Add RFC 1918 + loopback checks.

### H-4: SSE streams broadcast ALL data to ALL clients
- **File:** `src/infrastructure/shared-state.ts:~558`
- No per-agent scoping. Any connected client sees everything.
- **Fix:** Scope events to authenticated agent.

### H-5: Error details leaked in HTTP responses
- **File:** `src/infrastructure/shared-state.ts:~557`
- `String(err)` in response can include stack traces, file paths.
- **Fix:** Return generic "Internal error" to client, log full error server-side.

### H-6: Race condition — task state mutations not atomic
- **File:** `src/infrastructure/shared-state.ts`
- Two agents can resolve the same task simultaneously (last-write-wins). Terminal-state check not atomic with write.
- **Fix:** Use a lock per task ID, or check-then-write atomically.

### H-7: Unhandled promise rejection in subscribe()
- **File:** `src/infrastructure/shared-state.ts` (client)
- `connect()` called without `await` or `.catch()`. If fetch throws before try/catch, rejection is swallowed.
- **Fix:** Add `.catch()` or `await`.

### H-8: SSE heartbeat interval leaks on write failure
- **File:** `src/infrastructure/shared-state.ts`
- When broadcast write fails, client is removed from map but `setInterval` heartbeat timer is never cleared.
- **Fix:** Clear interval in error handler.

### H-9: waitForResult() doesn't clean up on timeout
- **File:** `src/infrastructure/shared-state.ts`
- Timeout fires → `reject()` called → `unsubscribe` never called → SSE subscription leaks.
- **Fix:** Call `unsubscribe()` in timeout handler.

---

## MEDIUM (track)

### M-1: No rate limiting
- **File:** `src/infrastructure/shared-state.ts` (all routes)
- No rate limiting middleware. Flood possible.
- **Fix:** Add `express-rate-limit`.

### M-2: MemPalace wing/room not sanitized
- **File:** `src/extension/mempalace-hooks.ts:38-43`
- Config values passed directly to MCP. Path traversal possible.
- **Fix:** Validate alphanumeric + hyphens only.

### M-3: .env loaded from CWD (not safe path)
- **File:** `src/extension/index.ts:63-85`
- If pi launched from untrusted directory, malicious `.env` could inject env vars.
- **Fix:** Load from extension install dir or `~/.pi/.env`.

### M-4: Task descriptions logged to stdout
- **File:** `src/infrastructure/shared-state.ts:~340`
- May contain sensitive instructions.
- **Fix:** Log only task IDs.

### M-5: Oversized functions (code quality)
- `loadConfig()` ~100 lines, `execute()` ~120 lines. Too many responsibilities.
- **Fix:** Decompose into smaller helpers.

### M-6: Duplicate code
- Team YAML resolution paths duplicated 3x. SSE streaming logic duplicated 2x.
- **Fix:** Extract shared constants and abstractions.

### M-7: Mutable module-level state
- 7 `let` variables mutated across loosely-connected functions. Implicit state machine.
- **Fix:** Encapsulate in class with explicit transitions.

---

## Summary

| Severity | Count | Key Theme |
|----------|-------|-----------|
| CRITICAL | 2 | Network exposure + zero auth |
| HIGH | 9 | RCE, impersonation, SSRF, race conditions, resource leaks |
| MEDIUM | 7 | Rate limiting, validation, code quality |
| **Total** | **18** | |

### Recommended Fix Order
1. C-1 (bind localhost) — one line, eliminates C-2 in practice
2. H-1 (JSON_SCHEMA for YAML) — one line change
3. H-7, H-8, H-9 (resource leaks) — small targeted fixes
4. H-6 (race condition on task state) — add per-task lock
5. H-3 (SSRF private IPs) — add 5 lines
6. H-5 (error leakage) — one line change
7. Rest as tracked items
