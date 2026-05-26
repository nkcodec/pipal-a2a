# PiPal-A2A Roadmap

**Google A2A v1.0 compliant — each pi terminal IS an agent.**

> **v0.4.1 shipped** — Worktree isolation. Structured responses. Skill guidelines. Production hardening. 206 tests. 21 PRs merged. Release-please CI.

---

## Versioning Strategy

```
v0.1.0  ← Foundation (core types + shared state + extension + tests)
v0.1.1  ← JSON-RPC 2.0 at POST /rpc ✅
v0.1.2  ← Streaming (SendStreamingMessage) ✅
v0.1.3  ← Multi-turn (contextId) ✅
v0.1.4  ← Auth (API Key) ✅
v0.1.5  ← Agent card discovery ✅
v0.1.6  ← Push notifications ✅
v0.1.7  ← Auto-Router (tag-based) ✅
v0.2.0  ← Essential A2A v1.0 features ✅
v0.2.1  ← Security hardening (Tier 1) ✅
v0.2.2  ← Infrastructure reliability (Tier 2) ✅
v0.2.3  ← Role reference pattern (DRY) ✅
v0.2.4  ← .env file support ✅
v0.3.0  ← Workflow PreHook ✅
v0.3.1  ← MemPalace integration ✅
v0.3.2  ← Full A2A spec compliance + security audit ✅
v0.3.2+ ← SQLite crash recovery + dead code cleanup + structural fixes ✅
v0.4.0  ← Agent isolation via git worktrees ✅
v0.4.1  ← Structured response transformer + release-please CI ✅
```

---

## v0.3.2 — Full A2A Spec Compliance ✅ SHIPPED

### A2A Spec Features (all implemented)

| Feature | Status |
|---------|--------|
| JSON-RPC binding (`/rpc`) | ✅ `POST /rpc` with JSON-RPC 2.0 |
| `tasks/sendMessage` | ✅ Registered |
| `tasks/getTask` | ✅ Registered |
| `tasks/cancelTask` | ✅ Registered |
| `tasks/resolveTask` | ✅ Registered |
| `tasks/listTasks` | ✅ Registered |
| `tasks/streamChunk` | ✅ Registered |
| `tasks/addMessage` | ✅ Registered (multi-turn) |
| `A2A-Version: 1.0` header | ✅ On all responses |
| JSON-RPC error codes | ✅ A2A spec mapped |

### Security Audit (11 issues fixed)

| ID | Issue | Fix |
|----|-------|-----|
| C-1 | Server binds 0.0.0.0 | `127.0.0.1` default + configurable host |
| C-2 | Zero-auth default | Fixed by localhost binding |
| H-1 | YAML RCE via `!!js/function` | `JSON_SCHEMA` |
| H-2 | Agent impersonation | Upsert on re-register (crash recovery) |
| H-3 | SSRF private IPs | RFC 1918 + loopback blocked |
| H-4 | SSE broadcasts all data | Per-agent scoping |
| H-5 | Error details leaked | Generic "Internal error" |
| H-6 | Task state race condition | Per-task mutex |
| H-7 | subscribe() unhandled rejection | `.catch()` handler |
| H-8 | Heartbeat interval leak | Clear on broadcast failure |
| H-9 | Timeout doesn't unsubscribe | `unsubscribe()` before reject |

### SQLite Crash Recovery

| Component | Storage | Survives crash? |
|-----------|---------|----------------|
| Agent cards | SQLite (WAL) | ✅ Yes |
| Tasks + state | SQLite (WAL) | ✅ Yes |
| Push configs | SQLite (WAL) | ✅ Yes |
| SSE connections | In-memory | ❌ Runtime only |
| Task locks | In-memory | ❌ Runtime only |
| Task streams | In-memory | ❌ Runtime only |

**Recovery flow:**
1. Server restarts → opens `.pipal-a2a/state.db` → agents/tasks restored
2. Agents detect SSE disconnect → auto-reconnect (exponential backoff)
3. On reconnect → re-register (upsert) → server returns `{recovered: true}`
4. In-flight tasks remain in `WORKING` state → agents pick up on reconnect

### Code Quality (karpathy-clean-code audit)

| Fix | Description |
|-----|-------------|
| Dead code removed | 570 lines — 3 MemPalace files, dead imports, unused helpers |
| StoredTask moved to core | Breaks circular dependency shared-state ↔ state-store |
| SmartRouter uses js-yaml | Replaced 80-line hand-rolled YAML parser |
| waitForTaskCompletion deduped | Merged two copies into one with full features |
| Health endpoint separated | Own `setupHealthRoutes()` method |

### MemPalace Integration

- Planner owns MemPalace via `promptGuidelines`
- Agents never see MemPalace (clean separation)
- Config: `mempalace.enabled`, `wing`, `sharedRoom`
- OFF by default (config activates, not defines)

**206 tests. 19 files. Real 3-agent E2E with crash recovery verified.**

---

## Skill Guidelines (PR #19–#21) ✅ SHIPPED

Behavioral instructions injected into task messages when a role receives delegated work.

### How it works

```
team.yaml skillGuidelines
    ↓
extension loads role's guidelines (before chdir to worktree)
    ↓
Guidelines appended to task message as bullet list
    ↓
Agent's pi instance already has all SKILL.md files loaded
    ↓
Guidelines trigger the right skill at the right time
```

### Key fix (debug-mantra)

`loadTeamRoles()` was called AFTER `chdir(worktree)`. The worktree checks out from HEAD which lacked uncommitted team.yaml changes. **Fix: load before chdir.**

### Terminology (disambiguated)

| Term | Meaning | Used by |
|------|---------|----------|
| `capabilities` | Routing labels — "what I can do" | SmartRouter, SkillMatcher |
| `tags` | Fuzzy keywords — "match my task text" | SmartRouter keyword scoring |
| `skillGuidelines` | Behavioral triggers — "how I think" | Injected into task messages |
| SKILL.md | Full skill definitions | Loaded by pi at startup (separate system) |

### Pattern: explicit skill pointers

Each guideline uses two signals so the agent knows where to find full details:
```
"Apply skill <name>: <essence>. Check skill: <name> for full details."
```

### Five-skill pipeline

| Skill | Trigger | Used by |
|-------|---------|----------|
| karpathy-clean-code | Build | All agents |
| debug-mantra | Debug | backend, frontend, planner |
| scrutinize | Review | reviewer, security, planner |
| post-mortem | Document | planner |
| management-talk | Communicate | planner |

---

## v0.4.0 — Agent Isolation (git worktrees) ✅ SHIPPED

Prevents file conflicts when multiple agents edit the same project.

### Architecture

```
src/builtin/isolation/
  isolation.ts         — IsolationStrategy interface (strategy pattern)
  no-isolation.ts      — default strategy (agents share cwd, zero overhead)
  worktree-isolation.ts — git worktree per agent
```

Config activates, not defines (same as RoutingStrategy).

### Isolation Strategies

| Strategy | Config | Behavior |
|----------|--------|----------|
| NoIsolation | `isolation: none` (default) | Agents share cwd — current behavior |
| WorktreeIsolation | `isolation: worktree` | Git worktree per agent on `agent/<name>` branch |

### Lifecycle

```
prepare()  → git worktree add .pipal-a2a/worktrees/<agent> -b agent/<agent>
finalize() → git add -A && git commit (in the worktree)
cleanup()  → git worktree remove (on disconnect)
```

### 3-Agent Review (security + implementation + UX)

All issues verified FIXED by 3 agents before ship:

| Severity | Issue | Fix |
|----------|-------|-----|
| 🔴 CRITICAL | Shell injection via agentName in execSync | `execFile()` array args + `validateName()` (alphanumeric only) |
| 🔴 CRITICAL | Path traversal (../../etc in agentName) | `resolve()` + startsWith check in getWorkDir() |
| 🔴 CRITICAL | Silent data loss (finalize swallows, cleanup removes) | finalize() returns `{success, error}`, skip cleanup on failure |
| 🟠 HIGH | execSync blocks event loop | Async `execFile()` for all git ops |
| 🟠 HIGH | Race condition on prepare/cleanup | Per-agent mutex (withLock) |
| 🟠 HIGH | Orphan worktrees (no crash cleanup) | `cleanupStale()` at startup + worktree prune |
| 🟠 HIGH | Undocumented (README had zero isolation mention) | Added Agent Isolation section to README |
| 🟠 HIGH | Planner no merge promptGuidelines | Added merge guideline to pipal_a2a_delegate |
| 🟡 MEDIUM | Merge tool branch injection risk | Regex validation `^agent/[a-zA-Z0-9_-]+$` |
| 🟡 MEDIUM | Merge conflict UX unhelpful | Structured 3-option guidance (resolve manually / theirs / abort) |
| 🟡 MEDIUM | Git hooks break in worktrees | `--no-verify` on commit |
| 🟡 MEDIUM | Worktree not in .gitignore | `.pipal-a2a/` already in .gitignore (v0.3.2) |

### Tests: 179 passing (17 files)

New isolation tests:
- Shell injection rejection (`, $, `, ..)
- Path traversal rejection (../../etc)
- finalize() returns {success, error}
- cleanupStale() removes orphan directories
- Multiple agents get separate worktrees
- finalize() commits changes correctly

### E2E Verified (real tmux sessions)

```
✅ 3-agent delegation: backend, frontend, reviewer all created files
✅ SSE event routing: task routed from planner → backend → result
✅ Crash recovery: backend killed → frontend worked → backend recovered
✅ All 3 agents confirmed all 16 issues fixed (reviewer + backend + frontend)
```

---

## Non-Goals

- ❌ Central orchestrator (P2P!)
- ❌ MCP for agent communication (A2A is the right protocol)
- ❌ Custom protocol (Google A2A is the standard)
- ❌ Agent marketplace (own team only)
- ❌ Splitting shared-state.ts / extension/index.ts into many files (YAGNI until it hurts)

---

## Shipped in v0.4.1+ (was Future Ideas)

| Feature | PR | Status |
|---------|-----|--------|
| Agent heartbeat + stale cleanup | #10 | ✅ Shipped |
| Graceful shutdown (SIGTERM/SIGINT) | #10 | ✅ Shipped |
| Server-side task timeout | #11 | ✅ Shipped |
| Health endpoint deep check | #12 | ✅ Shipped |
| Offline agent detection | #13 | ✅ Shipped |
| CLI rich output (agents/health) | #14 | ✅ Shipped |
| npm scripts (agents/health/serve) | #15 | ✅ Shipped |
| Worktree cwd sandbox fix | #16 | ✅ Shipped |
| ROADMAP update | #17 | ✅ Shipped |
| Graceful disable | #18 | ✅ Shipped |
| Skill guidelines via team.yaml | #19 | ✅ Shipped |
| Rename skills → capabilities | #20 | ✅ Shipped |
| Explicit skill pointers | #21 | ✅ Shipped |

## Future Ideas (YAGNI until they hurt)

| Idea | When to build |
|------|--------------|
| Auto-role assignment | When 5+ terminal teams become common |
| gRPC binding | When 100+ agents needed |
| pi-file-guard | When prompts can't prevent wrong writes |
| OAuth2 | When enterprise deployment needed |
| Rate limiting | When abuse becomes real |

---

## Architecture

```
src/                          Clean Architecture Layers:
├── core/types.ts             ← Core (frozen, no imports)
├── sdk/index.ts              ← SDK (types + factory functions)
├── application/              ← Application (coordinates, no logic)
│   ├── registry.ts
│   ├── router.ts
│   └── network.ts
├── infrastructure/           ← Infrastructure (implementations)
│   ├── shared-state.ts       (HTTP server + client)
│   ├── state-store.ts        (SQLite, WAL mode)
│   └── jsonrpc.ts            (JSON-RPC 2.0)
├── builtin/                  ← Built-in implementations
│   ├── smart-router.ts       (tag + skill routing)
│   └── skill-matcher.ts
├── extension/index.ts        ← Pi extension entry point
└── cli/index.ts              ← CLI
```

### Star Topology

```
  Terminal 1 (planner = HOST)
  ┌──────────────────────┐
  │  Shared State Server  │ ← first terminal auto-starts
  │  localhost:5000       │    others JOIN as clients
  │  SQLite + JSON-RPC    │
  │  + SSE                │
  └──────┬───┬───┬────────┘
         │   │   │  JSON-RPC + SSE
    ┌────┘   │   └────┐
    ▼        ▼        ▼
 backend  reviewer  frontend
 (JOIN)   (JOIN)    (JOIN)
```

- First agent to start becomes HOST (runs server)
- All others JOIN as clients
- ALL communication routes through HOST
- If HOST dies, network dies (single point of failure)
- Crash recovery: SQLite persists state, agents auto-reconnect

Correct for 3-5 agents on localhost. True P2P mesh is YAGNI.

---

## Success Criteria

1. ✅ **Spec compliant** — Google A2A v1.0 data model + JSON-RPC 2.0
2. ✅ **Installable** — `pi install pipal-a2a` works
3. ✅ **Real agents** — Each pi terminal IS an agent with full LLM + tools
4. ✅ **Real-time** — SSE streaming, no polling
5. ✅ **Delegation** — `pipal_a2a_delegate()` → task routes → result returns
6. ✅ **Observable** — `pipal_a2a_agents()`, `pipal_a2a_status()`
7. ✅ **Secure** — localhost binding, SSRF protection, YAML RCE prevented
8. ✅ **Zero config** — Works with defaults, configurable when needed
9. ✅ **Crash-safe** — SQLite WAL mode, auto-reconnect, upsert re-registration
10. ✅ **206 tests** — Core, infrastructure, extension, routing, isolation, transformer, E2E, crash recovery
11. ✅ **Skill guidelines** — Behavioral instructions flow to delegated agents via team.yaml
12. ✅ **21 PRs merged** — Clean git history, squash-merged
