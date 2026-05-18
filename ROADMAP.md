# PiPal-A2A Roadmap

**Google A2A v1.0 compliant — each pi terminal IS an agent.**

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

## Phase 1: Google A2A v1.0 Core Types ✅

- [x] Adopt Google A2A v1.0 data model from [spec](https://github.com/google/A2A)
- [x] `Task` — id, contextId, status, history, artifacts
- [x] `TaskState` — TASK_STATE_SUBMITTED/WORKING/COMPLETED/FAILED/CANCELED/REJECTED/INPUT_REQUIRED/AUTH_REQUIRED
- [x] `Message` — role (ROLE_USER/ROLE_AGENT), parts[], messageId
- [x] `Part` — unified: text, raw, url, data + mediaType
- [x] `Artifact` — artifactId, parts[], name, description
- [x] `AgentCard` — name, supportedInterfaces[], capabilities, skills[] (v1.0 shape)
- [x] `AgentSkill` — id, name, description, tags, examples
- [x] `AgentCapabilities` — streaming, pushNotifications, stateTransitionHistory
- [x] `AgentInterface` — url, protocolBinding, protocolVersion
- [x] Factory functions with deep `Object.freeze()`
- [x] Layer 1 tests — 19 tests, spec compliance verified

**Exit criteria:** Core types match Google A2A v1.0 spec. Zero external dependencies. ✅

---

## Phase 2: SDK + Builtin ✅

- [x] SDK with interfaces only (AgentRegistry, TaskRouter, RoutingStrategy)
- [x] Zero implementation in SDK
- [x] SkillMatcher in builtin/ (routes by AgentSkill matching)
- [x] Protocol compliance checks at definition time

**Exit criteria:** SDK has no function bodies with logic. ✅

---

## Phase 3: Shared State ✅

- [x] `SharedStateServer` — HTTP rendezvous server
- [x] `SharedStateClient` — connects to shared state
- [x] Agent registration (Google A2A AgentCard)
- [x] Task creation with TaskState lifecycle
- [x] Results as Artifact with Part[] (Google A2A spec)
- [x] SSE events for real-time notifications
- [x] Health check endpoint
- [x] Auto HOST/JOIN detection

**Exit criteria:** Two terminals register, exchange tasks via shared state. ✅

---

## Phase 4: Pi Extension ✅

- [x] Extension entry point with `export default function(pi)`
- [x] `pipal_a2a_delegate` tool registration
- [x] `/pipal-status` command
- [x] Auto-detect HOST vs JOIN on session_start
- [x] SSE subscription for incoming delegated tasks
- [x] Task injection via `pi.sendUserMessage()`
- [x] Result capture via `message_update` + `agent_end` events
- [x] Per-terminal config (`config/pipal-a2a.yaml`)
- [x] Environment variable overrides (`PIPAL_NAME`, `PIPAL_SKILLS`)

**Exit criteria:** `pi install ./pipal-a2a` → tool works, two terminals collaborate. ✅

---

## Phase 5: Tests (Current — In Progress)

- [x] Layer 1: Core type tests — 19 tests, no mocks
  - Google A2A spec compliance (TaskState SCREAMING_SNAKE_CASE, ISO 8601, AgentCard v1.0)
  - Deep freeze verification
  - Factory function correctness
- [ ] Layer 2: SharedStateServer tests with stub client
- [ ] Layer 2: Router tests with stub registry
- [ ] Layer 3: E2E — two simulated terminals, real HTTP, real task lifecycle

**Exit criteria:** All three test layers pass with zero mocks.

---

## Phase 6: Polish

- [ ] Real-time widget showing agent status in pi footer
- [ ] `/pipal-dashboard` command with live task progress
- [ ] Error recovery (SSE reconnection, task retry)
- [ ] Task queue (handle multiple incoming tasks)
- [ ] LICENSE (MIT)
- [ ] CONTRIBUTING.md

**Exit criteria:** Production-ready for team use.

---

## Google A2A v1.0 Spec Compliance Roadmap

### Already Implemented (v0.2)

- ✅ **AgentCard** — full v1.0 structure with `supportedInterfaces[]`
- ✅ **Task** — id, status, history, artifacts
- ✅ **TaskState** — all 8 states (SCREAMING_SNAKE_CASE)
- ✅ **Message** — ROLE_USER/ROLE_AGENT, parts[], messageId
- ✅ **Part** — unified (text, raw, url, data)
- ✅ **Artifact** — artifactId, parts[], name
- ✅ **AgentSkill** — id, name, description, tags, examples
- ✅ **AgentCapabilities** — streaming, pushNotifications
- ✅ **AgentInterface** — url, protocolBinding, protocolVersion
- ✅ **Task lifecycle** — SUBMITTED → WORKING → COMPLETED/FAILED
- ✅ **REST binding** — spec §11 HTTP+JSON

### v0.3 — JSON-RPC Binding

- [ ] `SendMessage` method (JSON-RPC)
- [ ] `GetTask` method
- [ ] `CancelTask` method
- [ ] `ListTasks` method
- [ ] `/.well-known/agent-card.json` for discovery
- [ ] `A2A-Version` header

### v0.4 — Streaming + Multi-turn

- [ ] `SendStreamingMessage` — SSE streaming (spec §3.1.2)
- [ ] `SubscribeToTask` — real-time task updates (spec §3.1.6)
- [ ] `contextId` — multi-turn conversations (spec §3.4)
- [ ] `TaskArtifactUpdateEvent` — stream artifacts as they're generated

### v0.5 — Auth

- [ ] API Key auth (`APIKeySecurityScheme`)
- [ ] `GetExtendedAgentCard` — authenticated discovery
- [ ] `SecurityScheme` in AgentCard

### v1.0 — Full Spec Compliance

- [ ] OAuth2 support
- [ ] gRPC binding (spec §10)
- [ ] Agent Card signing (spec §8.4)
- [ ] Push notifications (spec §3.1.7-3.1.10)
- [ ] Interop test with reference Google A2A implementation

---

## Future (Beyond v1.0)

| Feature | Why to skip |
|---------|-------------|
| Distributed shared state (Redis) | Single-machine is fine for team use |
| Multi-machine (WAN) | LAN is v1 scope |
| Agent marketplace | Own team only |
| Third-party extension system | Not needed |
| LangGraph conditional routing | Not the architecture |

---

## Non-Goals (v1)

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication (A2A is the right protocol)
- ❌ Synthetic agent runtime (each pi terminal IS the runtime)
- ❌ Multiple agents in one process
- ❌ Third-party plugin system
- ❌ Custom protocol (we use Google A2A)

---

## Success Criteria

1. **Spec compliant:** Google A2A v1.0 data model used throughout
2. **Installable:** `pi install ./pipal-a2a` works
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
