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
v0.1.5  ← agent card signing + well-known discovery
v0.1.6  ← push notifications
v0.1.7  ← gRPC binding
v0.1.8  ← OAuth2 + extended agent card
v0.1.9  ← final polish, interop tests
v0.2.0  ← = "v1.0" — full Google A2A spec compliance
v0.2.1  ← Auto-Router (skill-based, no human delegation)
```

**Rule:** `v0.2.0` is the milestone where we can say "fully Google A2A v1.0 compliant".
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

## v0.1.5 — Agent Card Discovery + Signing

Standard discovery and trust (Google A2A spec §8).

- [ ] `/.well-known/agent-card.json` endpoint on each agent
- [ ] `GetExtendedAgentCard` method (authenticated)
- [ ] AgentCard signing (RFC 8785 canonicalization + JWS)
- [ ] Signature verification on agent registration
- [ ] AgentCard caching (spec §8.6)

**Exit criteria:** Agents discoverable via well-known URI. Cards verifiable.

---

## v0.1.6 — Push Notifications

Implement push notifications (Google A2A spec §3.1.7-3.1.10).

- [ ] `CreateTaskPushNotificationConfig` method
- [ ] `GetTaskPushNotificationConfig` method
- [ ] `ListTaskPushNotificationConfigs` method
- [ ] `DeleteTaskPushNotificationConfig` method
- [ ] Webhook delivery of task completion events
- [ ] `PushNotificationConfig` in AgentCard capabilities

**Exit criteria:** Agents can receive task completion notifications via webhook.

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

## v0.1.8 — OAuth2 + Extended Agent Card

Enterprise auth (Google A2A spec §7).

- [ ] `OAuth2SecurityScheme` in AgentCard
- [ ] `OpenIdConnectSecurityScheme` in AgentCard
- [ ] OAuth2 flows for agent-to-agent auth
- [ ] `GetExtendedAgentCard` with OAuth2 bearer token
- [ ] Extended card contains sensitive capabilities

**Exit criteria:** Agents authenticate via OAuth2. Extended cards require auth.

---

## v0.1.9 — Final Polish + Interop

Ship readiness.

- [ ] Interop test with Google A2A reference implementation
- [ ] Spec compliance test suite (all methods, all states)
- [ ] Documentation: CONTRIBUTING.md, API reference
- [ ] LICENSE (MIT)
- [ ] Performance tuning (connection pooling, SSE reconnection)
- [ ] Error recovery (task retry, agent reconnection)
- [ ] Task queue (handle multiple incoming tasks)

**Exit criteria:** All Google A2A v1.0 spec requirements verified by test suite.

---

## v0.2.0 — Full Google A2A v1.0 Compliance 🎯

This IS the "v1.0" milestone. We can honestly say:

> "PiPal-A2A is fully compliant with the Google A2A v1.0 specification."

- [ ] All spec methods implemented (SendMessage, SendStreamingMessage, GetTask, ListTasks, CancelTask, SubscribeToTask, push notification CRUD, GetExtendedAgentCard)
- [ ] All three transport bindings (JSON-RPC, gRPC, REST)
- [ ] All auth schemes (API Key, OAuth2, OpenID Connect)
- [ ] AgentCard signing + verification
- [ ] Multi-turn with contextId
- [ ] Streaming with SSE events
- [ ] Push notifications via webhook
- [ ] **MemPalace integration** — agents store completed task artifacts in MemPalace for cross-session memory. Agents can query MemPalace via MCP for context before handling tasks.
- [ ] Full spec compliance test suite passing
- [ ] Interop verified with reference implementation
- [ ] npm publish as `pipal-a2a`

---

## v0.2.1 — Auto-Router (skill-based, no human delegation)

Replaces manual human delegation with automatic skill-based routing.
Per karpathy-clean-code: routing is configuration, not core.

- [ ] `TaskRouter` interface — pluggable routing strategy
- [ ] `SkillBasedRouter` — matches task to agent by skill, no human needed
- [ ] `config/team.yaml` — defines roles, skills, escalation rules
- [ ] `EscalationRule` — if skill unmatched, escalate to configured agent
- [ ] `DefaultTaskRouter` — current behavior (manual delegation) remains fallback
- [ ] Agent decides when to escalate vs handle directly

**Exit criteria:** User says "build a todo app", frontend agent auto-routes to backend + frontend without human telling it whom to delegate to.

Per karpathy-clean-code: Core (Task lifecycle) stays frozen. Router is infrastructure. Config activates, not defines.

---

## Non-Goals

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication (A2A is the right protocol)
- ❌ Synthetic agent runtime (each pi terminal IS the runtime)
- ❌ Multiple agents in one process
- ❌ Custom protocol (we use Google A2A)
- ❌ Agent marketplace (own team only)

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
