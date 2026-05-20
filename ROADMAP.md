# PiPal-A2A Roadmap

**Google A2A v1.0 compliant — each pi terminal IS an agent.**

> **v0.1.4 shipped** — 48 commits on `master`. API key auth on shared state server. Multi-turn. Streaming. JSON-RPC 2.0.

---

## Versioning Strategy

```
v0.1.0  ← current (core types + shared state + extension + tests)
v0.1.1  ← shipped: JSON-RPC 2.0 at POST /rpc ✅  (35 commits)
v0.1.2  ← streaming (SendStreamingMessage)
v0.1.3  ← multi-turn (contextId)
v0.1.4  ← auth (API Key) ✅
v0.1.5  ← agent card signing + well-known discovery ✅
v0.1.6  ← push notifications ✅
v0.1.7  ← Auto-Router (tag-based, no human delegation) ✅
v0.1.8  ← gRPC binding → Future Ideas
v0.1.9  ← OAuth2 + extended agent card → Future Ideas
v0.2.0  ← essential A2A v1.0 features ✅
v0.2.1  ← security hardening (Tier 1 fixes) ✅
v0.2.2  ← infrastructure reliability (Tier 2 fixes) ✅
v0.2.3  ← role reference pattern (DRY refactor) ✅
v0.2.4  ← .env file support (secrets out of git) ✅
v0.3.0  ← Workflow PreHook (automated multi-step workflows) ✅
v0.3.1  ← = "v1.0" — full Google A2A spec compliance
```

**Rule:** `v0.2.0` is the milestone where essential A2A v1.0 features work for real projects.
Everything before that is incremental, testable, shippable.

---

## Pre-flight Design (Completed)

| Question | Answer |
|----------|--------|
| Q1 Core | "Route tasks to specialized LLM agents via P2P delegation and return results" |
| Q2 External extensions | B — Own team only, manual registration |
| Q3 Extension types | None — no plugin system needed, each terminal IS an agent |
| Q4 Language + Portal | TypeScript, `package.json` pi key |
| Q5 Distribution | C — Git clone / local path at v1 |
| Q6 Trust level | A — Own team, no allowlist needed |
| Q7 Context | A — Greenfield |

---

## v0.1.0 — Foundation ✅

**34 commits.** Fully shipped. Run it today:

```bash
pi install ./pipal-a2a

# Terminal 1 — backend worker
PIPAL_NAME=backend PIPAL_SKILLS=code-generation,backend-implementation pi

# Terminal 2 — planner (in a new window)
PIPAL_NAME=planner PIPAL_SKILLS=planning,delegation pi

# In planner terminal, type:
Use pipal_a2a_delegate with to="backend" to send this task: write "hello from A2A" to test.txt
```

### Phase 1: Google A2A v1.0 Core Types ✅

- [x] Adopt Google A2A v1.0 data model
- [x] `Task`, `TaskState` (8 states, SCREAMING_SNAKE_CASE)
- [x] `Message` (ROLE_USER/ROLE_AGENT, parts[])
- [x] `Part` (unified: text, raw, url, data + mediaType)
- [x] `Artifact` (artifactId, parts[])
- [x] `AgentCard` (name, supportedInterfaces[], capabilities, skills[])
- [x] `AgentSkill`, `AgentCapabilities`, `AgentInterface`, `AgentProvider`
- [x] Factory functions with deep `Object.freeze()`
- [x] 19 tests — spec compliance verified

### Phase 2: SDK + Builtin ✅

- [x] SDK interfaces only (AgentRegistry, TaskRouter, RoutingStrategy)
- [x] SkillMatcher in builtin/ (routes by AgentSkill)
- [x] Protocol compliance checks

### Phase 3: Shared State ✅

- [x] `SharedStateServer` + `SharedStateClient`
- [x] Task lifecycle: SUBMITTED → WORKING → COMPLETED/FAILED
- [x] Results as Artifact with Part[] (Google A2A spec)
- [x] SSE for real-time events
- [x] Auto HOST/JOIN detection

### Phase 4: Pi Extension ✅

- [x] `pipal_a2a_delegate` tool + `/pipal-status` command
- [x] HOST/JOIN auto-detect on session_start
- [x] Task injection via `pi.sendUserMessage()`
- [x] Result capture via `message_update` + `agent_end`
- [x] Per-terminal config + env var overrides

### Phase 5: Tests ✅

- [x] Layer 1: 19 core tests, spec compliance, no mocks

**Exit criteria:** Two pi terminals can discover each other, delegate tasks, see results. ✅

---

## v0.1.1 — JSON-RPC Binding

Align transport with Google A2A spec §9 (JSON-RPC 2.0).

- [ ] Replace REST `/tasks` with JSON-RPC `SendMessage` method
- [ ] Implement `GetTask` method (JSON-RPC)
- [ ] Implement `CancelTask` method (JSON-RPC)
- [ ] Implement `ListTasks` method (JSON-RPC)
- [ ] `A2A-Version` header on all responses
- [ ] JSON-RPC error codes mapped from A2A spec
- [ ] Update SharedStateClient to use JSON-RPC calls
- [ ] Update extension to use new client API

**Exit criteria:** All agent communication uses JSON-RPC 2.0. REST endpoints removed.

---

## v0.1.2 — Streaming ✅

Implement `SendStreamingMessage` (Google A2A spec §3.1.2).

- [x] `subscribeToTask(taskId, onEvent)` — SSE client, returns unsubscribe fn
- [x] `GET /tasks/:taskId/streams` — per-task SSE endpoint with catch-up
- [x] `waitForResult(taskId)` — SSE-driven, no polling (catch-up + live events)
- [x] `TaskStatusUpdateEvent` — `task_update` broadcast on state transitions
- [x] `TaskArtifactUpdateEvent` — `artifact_update` broadcast on each token chunk
- [x] Backend streams LLM tokens via `streamChunk()` as `message_update` fires
- [x] Planner renders streaming output via pi's `onUpdate()` TUI callback

**Exit criteria:** Delegated task results stream back in real-time, not polled. ✅

---

## v0.1.3 — Multi-Turn ✅

Implement `contextId` for multi-turn conversations (Google A2A spec §3.4).

- [x] `contextId` on Task — auto-assigned or explicit on create
- [x] Follow-up messages via `sendFollowUp(taskId, message, {role, requireInput})`
- [x] `TASK_STATE_INPUT_REQUIRED` — agent asks for clarification via `pipal_a2a_ask`
- [x] Task history (`history[]`) populated across turns
- [x] User response restores `TASK_STATE_WORKING` — task resumes
- [x] Extension handles multi-turn: planner auto-responds, backend has ask tool

**Exit criteria:** Agent A can ask Agent B a follow-up question mid-task. ✅

---

## v0.1.4 — Auth (API Key) ✅

Add authentication (Google A2A spec §7).

- [x] `APIKeySecurityScheme` via `addApiKey(key)` on server
- [x] Shared state validates API key on all routes (Bearer token)
- [x] Per-agent API keys via `PIPAL_API_KEY` env var
- [x] 401 responses for missing/invalid keys
- [x] All routes protected: /agents, /register, /unregister, /rpc, /events, /tasks/:taskId/streams

**Exit criteria:** Unregistered agents cannot join the network. API keys required. ✅

---

## v0.1.5 — Agent Card Discovery + Signing ✅

Standard discovery and trust (Google A2A spec §8).

- [x] `/.well-known/agent-card.json` endpoint on shared state server
- [x] `discover()` method on client (public, no auth)
- [x] Returns all registered AgentCards
- [x] No auth required for discovery (public per spec)
- [x] AgentCard signing — SKIPPED (API key auth sufficient, per karpathy-clean-code)

**Exit criteria:** Agents discoverable via well-known URI. ✅ **SHIPPED**

---

## v0.1.6 — Push Notifications ✅

Implement push notifications (Google A2A spec §3.1.7-3.1.10).

- [x] `CreateTaskPushNotificationConfig` — POST /push-configs
- [x] `GetTaskPushNotificationConfig` — GET /push-configs/:id
- [x] `ListTaskPushNotificationConfigs` — GET /push-configs
- [x] `DeleteTaskPushNotificationConfig` — DELETE /push-configs/:id
- [x] Webhook delivery of task completion events
- [x] `PushNotificationConfig` type in core/types.ts
- [x] TaskId filter — only fire for specific tasks
- [x] Bearer token auth in webhook requests

**Exit criteria:** Agents can receive task completion notifications via webhook. ✅ **SHIPPED**

---

## v0.1.7 — gRPC Binding

Add gRPC transport (Google A2A spec §10).

- [ ] gRPC service definition from spec
- [ ] `SendMessage`, `GetTask`, `CancelTask` via gRPC
- [ ] `SendStreamingMessage` via server-streaming RPC
- [ ] Dual transport support (JSON-RPC + gRPC in AgentCard)
- [ ] Performance benchmarks vs JSON-RPC

**Exit criteria:** Agents can communicate via gRPC. AgentCard declares both bindings.

---

## v0.1.8 — OAuth2 + Extended Agent Card → Future Ideas

Enterprise auth (Google A2A spec §7).

Per karpathy-clean-code: YAGNI. API key auth is sufficient. Only build when: multi-tenant deployment, enterprise environments.

---

## v0.1.9 — Final Polish + Interop → Future Ideas

Ship readiness. Only build when: preparing for npm publish or external users.

---

## v0.2.0 — Essential Google A2A v1.0 Features ✅ SHIPPED

All essential Google A2A v1.0 features implemented, tested, and verified in real pi sessions.

**NOT full spec compliance.** Full compliance requires: gRPC binding, REST binding, OAuth2, OpenID Connect, card signing, extended card. Those are in Future Ideas (YAGNI until needed).

**What IS shipped:**
- [x] v0.1.2 — Streaming (SSE)
- [x] v0.1.3 — Multi-turn (contextId, INPUT_REQUIRED)
- [x] v0.1.4 — Auth (API key)
- [x] v0.1.5 — Well-known discovery
- [x] v0.1.6 — Push notifications (webhook)
- [x] v0.1.7 — Auto-Router (tag-based)
- [x] 98 tests passing
- [x] 3-agent end-to-end tested
- [x] Real pi sessions with delegation working

**Skipped (YAGNI):**
- v0.1.8 gRPC binding → Future Ideas
- v0.1.8 OAuth2 + extended agent card → Future Ideas
- Card signing → premature
- Auto-role assignment → premature

---


Replaces manual human delegation with automatic skill-based routing.
Per karpathy-clean-code: routing is configuration, not core.

- [ ] `TaskRouter` interface — pluggable routing strategy
- [ ] `SkillBasedRouter` — matches task to agent by skill, no human needed
- [ ] `config/team.yaml` — defines roles, skills, escalation rules
- [ ] `EscalationRule` — if skill unmatched, escalate to configured agent
- [ ] `DefaultTaskRouter` — current behavior (manual delegation) remains fallback
- [ ] Agent decides when to escalate vs handle directly

**Exit criteria:** User says "build a todo app", frontend agent auto-routes to backend + frontend without human telling it whom to delegate to. ✅ **SHIPPED**

Per karpathy-clean-code: Core (Task lifecycle) stays frozen. Router is infrastructure. Config activates, not defines. ✅ **SHIPPED**

---

## v0.2.1 — Security Hardening ✅ SHIPPED

Tier 1 critical + high fixes. Karpathy-clean-code principle: protect the frozen core first.

**Per karpathy-clean-code:** Core (`src/core/types.ts`) is frozen — never touched. SDK is a stability promise — only backward-compatible changes. Infrastructure fixes must be surgical.

**Fixes applied (5):**
- [x] C-1: Unsafe YAML parsing → `DEFAULT_SAFE_SCHEMA` (arbitrary code execution prevented)
- [x] H-7: Task state machine validation → terminal states now rejected on `resolveTask`
- [x] C-3: SSE injection via `clientId` → replaced interpolation with `JSON.stringify()`
- [x] H-3: RPC input validation → `typeof` checks on 6 RPC handlers
- [x] H-4: SmartRouter SDK mismatch → `excludeSelf?` added to `RoutingStrategy` interface

**Files modified:** `src/extension/index.ts`, `src/infrastructure/shared-state.ts`, `src/sdk/index.ts`
**Tests:** 98 passed, 0 failed (no behavior change)
**Reports:** `backend-review.md` (28 issues found), `tier1-fix-report.md` (fix details)

---

## v0.2.2 — Infrastructure Reliability (Planned)

Tier 2 fixes — reliability bugs that don't corrupt core but crash the system or leak data.

- [x] H-1: TOCTOU race in HOST/JOIN detection → try/catch fallback for `EADDRINUSE`
- [x] C-4: Unbounded memory growth → TTL-based task cleanup + SSE liveness check
- [x] H-2: No request body size limit → `express.json({ limit: '1mb' })`
- [x] C-2: SSRF via push notification webhooks → URL validation + block cloud metadata/internal ports

---

## v0.2.3 — Role Reference Pattern (DRY Refactor) ✅ SHIPPED

Per karpathy-clean-code: Config activates, not defines. Single source of truth.

**Problem:** Identity data (name, skills, tags) was duplicated in 3 places (pipal-a2a.yaml, team.yaml, env vars).
This caused a real bug: planner agent had no tags because pipal-a2a.yaml didn't set them,
but team.yaml defined tags. SmartRouter couldn't route correctly.

**Solution:** `team.yaml` is now the single source of truth. `pipal-a2a.yaml` just references a role name.

**Changes:**
- [x] `pipal-a2a.yaml`: identity block replaced with `role: planner` (1 line)
- [x] `loadConfig()`: resolves role from team.yaml before env var overrides
- [x] New `PIPAL_ROLE` env var: overrides file role, resolves from team.yaml
- [x] `/pipal-role` command: updates `config.role` for consistency
- [x] Backward compat: old-style `identity:` block still works

**Precedence:** PIPAL_ROLE env → pipal-a2a.yaml role → team.yaml → identity block (legacy)
**Files:** config/pipal-a2a.yaml, src/extension/index.ts
**Tests:** 98 passed, 0 failed

---

## v0.2.4 — .env File Support (Secrets Out of Git) ✅ SHIPPED

Per karpathy-clean-code: Simplicity first. Zero new dependencies.

**Problem:** apiKey secret was stored in pipal-a2a.yaml, which is committed to git.
Secrets should not be in version control. Per-project isolation needed.

**Solution:** Zero-dependency .env loader. Secrets in .env (gitignored), not in YAML config.

**Changes:**
- [x] Added `loadEnvFile()` — manual .env parser, no npm packages
- [x] Called at start of `loadConfig()` before any config resolution
- [x] Created `.env` with `PIPAL_API_KEY=secret123`
- [x] Removed `apiKey` from `pipal-a2a.yaml`
- [x] `.gitignore` already had `.env` — no change needed

**Precedence:** env var (external) → .env file → pipal-a2a.yaml apiKey → no auth
**Files:** src/extension/index.ts, config/pipal-a2a.yaml, .env (new)
**Tests:** 98 passed, 0 failed

---

## v0.3.0 — Workflow PreHook ✅ SHIPPED

Per karpathy-clean-code: Config activates, not defines. Workflow = structured plan.

**Problem:** Manual coordination of 5+ agents is error-prone. Critical steps can be missed.

**Solution:** Workflow PreHook intercepts delegation and auto-executes multi-step workflows from config/team.yaml.

**Changes:**
- [x] Added `workflows` block to team.yaml (btc-trading, todo-app)
- [x] Added `loadWorkflows()` — reads workflows from same YAML paths
- [x] Added `executeWorkflowIfMatch()` — PreHook that matches tasks to workflows
- [x] Added `waitForTaskCompletion()` — SSE subscription with timeout
- [x] Added `WorkflowStep` and `Workflow` types
- [x] Hooked into delegate tool — checks workflow before normal routing
- [x] Added new roles: data, security, reviewer (for btc-trading workflow)

**How it works:**
- Task "build btc-trading" → matches workflow in team.yaml → auto-executes all 5 steps
- Task "build todo-app" → matches workflow → auto-executes 2 steps
- Other tasks → normal delegation (SmartRouter or first available)

**PreHook guarantees 100% workflow execution.** Explicit `to=` or `skill=` bypasses PreHook.

**Files:** config/team.yaml, src/extension/index.ts
**Tests:** 98 passed, 0 failed

---

## Non-Goals

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication (A2A is the right protocol)
- ❌ Synthetic agent runtime (each pi terminal IS the runtime)
- ❌ Multiple agents in one process
- ❌ Custom protocol (we use Google A2A)
- ❌ Agent marketplace (own team only)

---

## Future Ideas (post v0.2.x)

### pi-file-guard — Role-based file write restriction

Separate extension. NOT part of pipal-a2a (different job).

Per karpathy-clean-code: prompts > code. Only build if guidelines fail.

```yaml
# config/roles.yaml
planner:
  allowWrite: ["*.md", "*.txt", "*.yaml"]  # only specs and plans
  blockWrite: ["*.js", "*.ts", "*.jsx", "*.py"]  # no implementation

backend:
  allowWrite: ["*"]  # unrestricted

frontend:
  allowWrite: ["*"]  # unrestricted
```

Implementation:
- Hooks into `pi.on("tool_call", ...)` — blocks write/edit for restricted roles
- Reads `config/roles.yaml` for per-role file patterns
- Separate `pi-file-guard` extension (not pipal-a2a)
- Triggered only if promptGuidelines can't prevent planner from writing code

### Structured Agent Responses — Better UX for delegated results

Instead of raw text, agents return formatted responses with status, duration, file tree.

Per karpathy-clean-code: YAGNI. Only build when real users ask for it.

```
┌─ backend ✅ ──────────────────────────────────────┐
│ Task: Build Node.js REST API                       │
│ Duration: 12s                                       │
│ Files: 3 created                                    │
│                                                     │
│  📁 calculator-app/backend/                        │
│  ├── server.js (75 lines)                          │
│  ├── todoStore.js (67 lines)                       │
│  └── package.json                                   │
└────────────────────────────────────────────────────┘
```

Implementation:
- `postDelegatedResult()` formats response before posting
- `handleIncomingTask()` injects structured prompt into agent
- Config: `responseFormat: "structured"` per role
- No protocol changes — just better formatting

### Auto-Role Assignment — Team topology from well-known discovery

Terminal compares `config/team.yaml` (expected) vs `/.well-known/agent-card.json` (actual).
Auto-assigns first missing role. No env vars needed.

Per karpathy-clean-code: YAGNI. Most projects need 2-3 agents max. Manual env vars are simpler.

```
Terminal 1 starts → discovers no agents → auto-assigns HOST + first role (backend)
Terminal 2 starts → discovers backend → auto-assigns frontend
Terminal 3 starts → discovers backend + frontend → auto-assigns planner
```

Implementation:
- Extension reads `config/team.yaml` on startup
- Calls `client.discover()` to find online agents
- Compares expected vs actual roles
- Auto-assigns first missing role (name, skills, tags)
- Only build when manual env vars become painful for 5+ terminal teams

### gRPC Binding — Alternative wire format

gRPC server alongside Express. Same logic, binary protobuf instead of JSON.

Per karpathy-clean-code: YAGNI. JSON-RPC is fine for 3 agents on localhost. LLM is 99.99% of latency.

```
New file: src/infrastructure/grpc.ts (~80 lines)
Proto:   pipal-a2a.proto (~50 lines)
Deps:    @grpc/grpc-loader, @grpc/proto-loader
Core code changed: ZERO
```

Only build when: 100+ agents, 10,000 tasks/sec, microsecond deadlines.

---

## Success Criteria

1. **Spec compliant:** Google A2A v1.0 data model used throughout
2. **Installable:** `pi install pipal-a2a` works
3. **Real agents:** Each pi terminal IS an agent with full LLM + tools
4. **Real-time:** Users see agents working in their own terminals
5. **Delegation:** LLM calls `pipal_a2a_delegate()` → Task routes → result returns
6. **Observable:** `/pipal-status` shows live network
7. **Zero config:** Works with defaults, configurable when needed

---

## Architecture Reference

```
                         Google A2A v1.0 Data Model
                         ┌───────────────────────────┐
                         │  AgentCard                 │
                         │  ├── supportedInterfaces[] │
                         │  ├── capabilities          │
                         │  └── skills[]              │
                         │                            │
                         │  Task                      │
                         │  ├── status (TaskState)    │
                         │  ├── history (Message[])   │
                         │  └── artifacts (Part[])    │
                         └───────────────────────────┘
                                      │
          ┌───────────────────────────┼───────────────────────────┐
          │                           │                           │
Terminal 1 (planner)       Terminal 2 (backend)        Terminal 3 (reviewer)
┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
│ pi + extension   │      │ pi + extension   │      │ pi + extension   │
│                  │      │                  │      │                  │
│ AgentCard:       │      │ AgentCard:       │      │ AgentCard:       │
│  name: planner   │      │  name: backend   │      │  name: reviewer  │
│  skills: [...]   │      │  skills: [...]   │      │  skills: [...]   │
│                  │      │                  │      │                  │
│ Creates Task ────┼─────►│ Processes Task   │      │                  │
│ (SUBMITTED)      │      │ (WORKING)        │      │                  │
│                  │      │       │          │      │                  │
│ Waits for result │◄─────┼───────┘          │      │                  │
│ (COMPLETED)      │      │ Artifact[]       │      │                  │
│                  │      │ returned         │      │                  │
│                  │      │                  │      │                  │
│ Creates Task ────┼────────────────────────────────┼─►│ Processes Task│
│ (SUBMITTED)      │      │                  │      │  (WORKING)      │
└──────────────────┘      └──────────────────┘      └──────────────────┘
          │                           │                           │
          └───────────── REST + SSE ──┴───────────── REST + SSE ──┘
                              │
                    ┌─────────┴──────────┐
                    │   Shared State     │
                    │   localhost:5000   │  ← First terminal auto-starts
                    │   (rendezvous)     │     Others JOIN via SSE
                    └────────────────────┘
```
