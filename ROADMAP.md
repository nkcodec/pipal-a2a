# PiPal-A2A Roadmap

**Each pi terminal IS an agent.**

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

## Phase 1: Core Types ✅

- [x] Define `A2AMessage`, `TaskResult`, `AgentCard`, `Skill` in core/types.ts
- [x] Frozen — zero imports from other layers
- [x] Factory functions with `Object.freeze()` for immutability
- [x] Layer 1 tests (no mocks)

**Exit criteria:** Core types compile with no external dependencies.

---

## Phase 2: SDK + Builtin ✅

- [x] SDK with interfaces only (AgentRegistry, TaskRouter, RoutingStrategy)
- [x] Zero implementation in SDK
- [x] SkillMatcher in builtin/ (proves RoutingStrategy interface)
- [x] Protocol compliance checks at definition time

**Exit criteria:** SDK has no function bodies with logic.

---

## Phase 3: Shared State ✅

- [x] `SharedStateServer` — HTTP rendezvous server
- [x] `SharedStateClient` — connects to shared state
- [x] Agent registration endpoints
- [x] Task creation + result endpoints
- [x] SSE events for real-time notifications
- [x] Health check endpoint
- [x] Auto HOST/JOIN detection

**Exit criteria:** Two terminals can register, exchange tasks via shared state.

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

**Exit criteria:** `pi install ./pipal-a2a` → tool works, two terminals collaborate.

---

## Phase 5: Tests (Current)

- [x] Layer 1: Core type tests (no mocks)
- [ ] Layer 2: SharedStateServer tests with stub client
- [ ] Layer 2: Router tests with stub registry
- [ ] Layer 3: E2E — two terminals, real HTTP, real task delegation

**Exit criteria:** All three test layers pass with zero mocks.

---

## Phase 6: Polish

- [ ] Real-time widget showing agent status in pi footer
- [ ] `/pipal-dashboard` command with live task progress
- [ ] Error recovery (SSE reconnection, task retry)
- [ ] Task queue (handle multiple incoming tasks)
- [ ] README with step-by-step tutorial
- [ ] LICENSE (MIT)
- [ ] CONTRIBUTING.md

**Exit criteria:** Production-ready for team use.

---

## Future (v2+)

| Feature | Why to skip at v1 |
|---------|-------------------|
| Agent heartbeat / liveness | No long-lived idle sessions observed yet |
| Task queue (multiple incoming) | Single-task-at-a-time is fine for v1 |
| SSE reconnection | Restart is acceptable |
| Streaming results (token-by-token) | Full response is fine for v1 |
| Distributed shared state (Redis) | Single-machine is fine for team use |
| Task cancellation | No long-running tasks yet |
| Multi-machine support | LAN is v1, WAN is v2 |

---

## Non-Goals (v1)

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication
- ❌ Synthetic agent runtime wrapping `createAgentSession()`
- ❌ Multiple agents in one process
- ❌ Third-party plugin system
- ❌ LangGraph conditional routing

---

## Success Criteria

1. **Installable:** `pi install ./pipal-a2a` works
2. **Real agents:** Each pi terminal IS an agent with full LLM + tools
3. **Real-time:** Users see agents working in their own terminals
4. **Delegation:** LLM calls `pipal_a2a_delegate()` → task routes to peer → result returns
5. **Observable:** `/pipal-status` shows live network
6. **Zero config:** Works with defaults, configurable when needed

---

## Architecture Reference

```
Terminal 1                     Terminal 2                     Terminal 3
┌─────────────────┐           ┌─────────────────┐           ┌─────────────────┐
│ pi + extension   │           │ pi + extension   │           │ pi + extension   │
│                  │           │                  │           │                  │
│ pipal_a2a_       │           │ receives task    │           │ receives task    │
│ delegate(tool)   │           │ via SSE → LLM    │           │ via SSE → LLM    │
│                  │           │ processes it     │           │ processes it     │
│ /pipal-status    │           │ (user sees it!)  │           │ (user sees it!)  │
└────────┬─────────┘           └────────┬─────────┘           └────────┬─────────┘
         │                              │                              │
         └──────────── HTTP + SSE ──────┴──────────── HTTP + SSE ─────┘
                              │
                    ┌─────────┴──────────┐
                    │   Shared State     │
                    │   localhost:5000   │  ← First terminal auto-starts
                    │   (rendezvous)     │
                    └────────────────────┘
```
