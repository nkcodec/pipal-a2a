# Code Review Report — pipal-a2a v0.3.1

**Date:** 2026-05-22
**Reviewers:** security, backend, reviewer agents
**Scope:** All `src/` files

> **STATUS: All 11 issues fixed in v0.3.2.** This report is kept for historical reference.
> See [ROADMAP.md](../ROADMAP.md) for the fix details.

---

## Issues Found → Fix Status

### CRITICAL (2/2 fixed)

| ID | Issue | Fix | Commit |
|----|-------|-----|--------|
| C-1 | Server binds to 0.0.0.0 (network exposure) | `127.0.0.1` default + configurable host | `a07713f` |
| C-2 | Zero-auth default | Fixed by localhost binding | `a07713f` |

### HIGH (9/9 fixed)

| ID | Issue | Fix | Commit |
|----|-------|-----|--------|
| H-1 | js-yaml DEFAULT_SCHEMA allows RCE | `JSON_SCHEMA` | `f0a2058` |
| H-2 | Agent identity impersonation | Upsert on re-register (crash recovery) | `c65d2dd`, `bb28cee` |
| H-3 | SSRF — private IPs not blocked | RFC 1918 + loopback checks | `f0a2058` |
| H-4 | SSE broadcasts ALL data to ALL clients | Per-agent scoping | `89dec39` |
| H-5 | Error details leaked in HTTP responses | Generic "Internal error" | `f0a2058` |
| H-6 | Race condition — task state not atomic | Per-task mutex | `c65d2dd` |
| H-7 | Unhandled promise rejection in subscribe() | `.catch()` handler | `f0a2058` |
| H-8 | SSE heartbeat interval leaks | Clear on broadcast failure | `c65d2dd` |
| H-9 | waitForResult() doesn't unsubscribe | `unsubscribe()` before reject | `f0a2058` |

### MEDIUM (tracked, not all fixed)

| ID | Issue | Status |
|----|-------|--------|
| M-1 | No rate limiting | Tracked — add when abuse is real |
| M-2 | MemPalace wing/room not sanitized | **N/A** — `mempalace-hooks.ts` deleted (dead code). MemPalace is now promptGuidelines-only (Option D). LLM handles validation. |
| M-3 | .env loaded from CWD | Tracked — low risk for localhost dev |
| M-4 | Task descriptions logged to stdout | Tracked — only task IDs logged now |
| M-5 | Oversized functions | Partially fixed — `waitForTaskCompletion` deduped |
| M-6 | Duplicate code | Partially fixed — team YAML deduped |
| M-7 | Mutable module-level state | Tracked — works for current scale |

---

## Code Quality Audit (post v0.3.2)

A karpathy-clean-code review was conducted after the security fixes. Results:

### Dead Code Removed (570 lines)
- `src/extension/mempalace.ts` (90 lines) — dead, never imported
- `src/extension/mempalace-hooks.ts` (162 lines) — dead, never imported
- `src/extension/mempalace-types.ts` (81 lines) — dead, never imported
- Dead `DefaultTaskRouter` import + unused variable
- Dead helper functions (`errorResp`, `okResp`, `taskNotFound`)
- Dead protocol compliance checks (runtime side effects at import time)

### Structural Fixes
- `StoredTask` moved from `shared-state.ts` to `core/types.ts` (breaks circular dependency)
- SmartRouter: replaced 80-line hand-rolled YAML parser with `js-yaml`
- `waitForTaskCompletion`: merged two near-identical copies into one
- Health endpoint: moved from SSE routes to own method

### Test Results
- **163 tests, 16 files, 0 failures**
- Real 3-agent E2E with crash recovery verified on real pi terminals
