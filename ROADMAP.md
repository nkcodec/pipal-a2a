# PiPal-A2A Roadmap

**Peer-to-peer multi-agent orchestration via A2A protocol**

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

## Phase 2: Infrastructure — Transport (Day 2)

- [ ] `A2AServer` — HTTP server with SSE for events
- [ ] `A2AClient` — HTTP client to send messages to peers
- [ ] Agent Card endpoint (`GET /agent-card`)
- [ ] Task endpoint (`POST /tasks`)
- [ ] Task streaming via SSE

**Exit criteria:** Two agents can exchange messages via HTTP.

---

## Phase 3: Infrastructure — pi-agent Adapter (Day 2-3)

- [ ] `PiAgentAdapter` — wraps pi-agent-sdk
- [ ] `AgentSession` — manages pi session per agent
- [ ] Tool bridge — exposes A2A skills to pi agent
- [ ] Skill execution — pi agent executes task, returns result

**Exit criteria:** Single agent can execute a skill via pi-agent.

---

## Phase 4: Application — Registry & Router (Day 3)

- [ ] `AgentRegistry` — maintains agent cards
- [ ] `TaskRouter` — routes tasks to agents based on skill
- [ ] `MessageBus` — pub/sub for local events
- [ ] Agent discovery from config file

**Exit criteria:** Task routed to agent with matching skill.

---

## Phase 5: Dashboard (Day 3-4)

- [ ] Real-time agent communication visualization
- [ ] SSE stream from MessageBus
- [ ] Task status cards per agent
- [ ] Message timeline (peer-to-peer events)

**Exit criteria:** Dashboard shows agent-to-agent messages in real-time.

---

## Phase 6: CLI (Day 4)

- [ ] `pipal-a2a start` — start all agents
- [ ] `pipal-a2a agent <name>` — start single agent
- [ ] `pipal-a2a status` — show agent registry
- [ ] `pipal-a2a send <from> <to> <task>` — send task directly

**Exit criteria:** All commands work as documented.

---

## Phase 7: Integration Test (Day 5)

- [ ] Two agents exchange tasks via A2A
- [ ] Skill delegation works (orchestrator → worker → reviewer)
- [ ] Dashboard shows peer-to-peer flow
- [ ] Error handling (agent down, task timeout)

**Exit criteria:** End-to-end workflow completes with dashboard visualization.

---

## Phase 8: Open Source Prep

- [ ] Clean git history (squash experimental commits)
- [ ] LICENSE (Apache 2.0)
- [ ] CONTRIBUTING.md
- [ ] npm publish (if protocol stabilizes)

---

## Prioritized Backlog

### High Priority
- **Skill matching** — route tasks to agents with matching skills
- **SSE streaming** — real-time dashboard updates
- **pi-agent integration** — actual LLM execution

### Medium Priority
- **Agent heartbeat** — detect stale agents
- **Task retry** — retry failed tasks on different agent
- **Skill registry** — central skill catalog

### Low Priority (v2+)
- **DNS discovery** — agents find each other via DNS
- **Weighted routing** — skills with confidence scores
- **Agent groups** — agent pools for parallel execution

---

## Non-Goals (v1)

- ❌ Central orchestrator (this is A2A!)
- ❌ LangGraph conditional routing
- ❌ Third-party extension portal
- ❌ Multi-language support (TypeScript only)
- ❌ Persistence (in-memory only at v1)

---

## Success Criteria

1. **Protocol correctness:** Agents exchange valid A2A messages
2. **Skill routing:** Tasks route to agents with matching skills
3. **Real-time visibility:** Dashboard shows peer-to-peer events
4. **LLM execution:** Agents execute tasks via pi-agent-sdk
5. **Zero central control:** No orchestrator decides execution order