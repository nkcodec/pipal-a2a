# PiPal-A2A Roadmap

**P2P multi-agent orchestration built on `pi-coding-agent`**

---

## Pre-flight Design

### Q1 Core: Route A2A messages between agents via Shared State
Messages flow peer-to-peer through Shared State (blackboard). No central orchestrator — agents negotiate via A2A messages.

### Q2 Extensions: Built ON TOP of `pi-coding-agent`
PiPal-A2A is an extension for the official `pi-coding-agent`. Uses `createPiAgentSession()` for LLM execution.

### Q3 Extension Types: N/A
PiPal-A2A is a coordination layer, not a plugin system.

### Q4 Language: TypeScript
Node.js for HTTP server, pi-coding-agent SDK compatibility.

### Q5 Distribution: Git clone only at v1

### Q6 Trust: Own team only

### Q7 Context: Greenfield

---

## Phase 0: Core Types (Day 1) ✅

- [x] Define `A2AMessage` core type
- [x] Define `TaskResult` core type
- [x] Define `AgentCard` core type
- [x] Define `Skill` core type
- [x] Core has ZERO infrastructure imports

**Exit criteria:** Core types compile with no external dependencies.

---

## Phase 1: SDK (Day 1)

- [ ] Define protocol interfaces (no implementation)
- [ ] One import path: `pipal-a2a/sdk`
- [ ] Protocol compliance checked at compile time

**Exit criteria:** AgentCard, TaskMessage, Skill types exported from single entry.

---

## Phase 2: Shared State (Day 2)

- [ ] `SharedState` class — task, steps, artifacts
- [ ] REST endpoints: GET/POST /tasks, /artifacts
- [ ] SSE stream for real-time updates
- [ ] Domain-organized structure

**Exit criteria:** Multiple agents can read/write same state via HTTP.

---

## Phase 3: P2P Network (Day 2-3)

- [ ] `A2ATransport` — HTTP server + SSE
- [ ] `A2AClient` — send messages to peers
- [ ] Agent discovery from config
- [ ] Peer-to-peer messaging (NOT client-server)

**Exit criteria:** Agent A can message Agent B directly via A2A.

---

## Phase 4: pi-coding-agent Integration (Day 3)

- [ ] `PiAgentAdapter` — wraps `createPiAgentSession()`
- [ ] Each peer creates own Pi Session for LLM work
- [ ] Skill execution via LLM

**Exit criteria:** Agent can execute task using `pi-coding-agent` SDK.

---

## Phase 5: Extension Function (Day 4)

- [ ] `pipal_a2a_delegate()` — main extension function
- [ ] Called by user (replaces orchestrator role)
- [ ] Creates initial task in Shared State

**Exit criteria:** User calls `pipal_a2a_delegate()` → task appears in Shared State.

---

## Phase 6: Dashboard (Day 4-5)

- [ ] Real-time agent communication visualization
- [ ] SSE stream from Shared State
- [ ] Task status cards per agent
- [ ] Artifact viewer

**Exit criteria:** Dashboard shows peer-to-peer flow in real-time.

---

## Phase 7: CLI Integration (Day 5)

- [ ] `pipal-a2a start` — start all peers
- [ ] `pipal-a2a status` — show shared state
- [ ] Works as extension for `pi-coding-agent`

**Exit criteria:** Works alongside `pi-coding-agent` CLI.

---

## Phase 8: Integration Test (Day 6)

- [ ] Two agents exchange tasks via A2A
- [ ] Shared State shows progress
- [ ] Dashboard shows peer-to-peer flow
- [ ] Uses `pi-coding-agent` for LLM execution

**Exit criteria:** End-to-end workflow completes with dashboard visualization.

---

## Phase 9: Open Source Prep

- [ ] Clean git history
- [ ] LICENSE (MIT)
- [ ] CONTRIBUTING.md
- [ ] npm publish

---

## Prioritized Backlog

### High Priority
- **Shared State REST API** — HTTP server for state
- **SSE streaming** — real-time updates
- **pi-coding-agent integration** — use official SDK

### Medium Priority
- **A2A peer discovery** — agents find each other
- **Skill routing** — tasks route by skill
- **Domain organization** — domain-based Shared State

### Low Priority (v2+)
- **Agent heartbeat** — detect stale peers
- **Task retry** — retry failed tasks
- **Distributed Shared State** — Redis for scale

---

## Non-Goals (v1)

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication
- ❌ Third-party extension system
- ❌ LangGraph conditional routing

---

## Success Criteria

1. **Protocol correctness:** Agents exchange A2A messages via Shared State
2. **P2P communication:** Any peer can message any other
3. **Shared State:** All agents see same task/steps/artifacts
4. **Real-time visibility:** Dashboard shows peer-to-peer events
5. **pi-coding-agent integration:** Uses official SDK for LLM

---

## Architecture Reference

```
pi-coding-agent (OFFICIAL BASE)
         ▲
         │ extends
         │
┌────────────────────────────────────────────────────┐
│              PiPal-A2A (EXTENSION)                 │
│                                                    │
│   ┌────────────────────────────────────────────┐  │
│   │         SHARED STATE                       │  │
│   │   task, steps, artifacts (HTTP + SSE)       │  │
│   └────────────────────────────────────────────┘  │
│                         │                          │
│                         │ HTTP                      │
│                         ▼                          │
│              ┌─────────┬─────────┬─────────┐       │
│              │    A    │    B    │    C    │       │
│              │ planner │ worker  │ reviewer│       │
│              │   pi    │   pi    │   pi    │       │
│              └─────────┴─────────┴─────────┘       │
└────────────────────────────────────────────────────┘
```