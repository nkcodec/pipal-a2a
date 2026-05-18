# PiPal-A2A Roadmap

**P2P multi-agent orchestration — a pi extension**

---

## Pre-flight Design (Completed)

| Question | Answer |
|----------|--------|
| Q1 Core | "Route tasks to specialized LLM agents via P2P A2A messages and return results" |
| Q2 External extensions | B — Own team only, manual registration |
| Q3 Extension types | PreHook: N, PostHook: N, Transformer: N, Sink: N (no plugin system needed) |
| Q4 Language + Portal | TypeScript, `package.json` pi key |
| Q5 Distribution | C — Git clone / local path at v1 |
| Q6 Trust level | A — Own team, no allowlist needed |
| Q7 Context | A — Greenfield |

---

## Phase 1: Make It a Pi Extension ✅

- [x] Create `src/extension/index.ts` — pi extension entry point
- [x] Export `default function(pi: ExtensionAPI)`
- [x] Register `pipal_a2a_delegate` tool via `pi.registerTool()`
- [x] Register `/pipal-status` command via `pi.registerCommand()`
- [x] Wire lifecycle events (`session_start`, `session_shutdown`)
- [x] Update `package.json` with `"pi": { "extensions": [...] }` key
- [x] Add `@earendil-works/pi-coding-agent` as peerDependency

**Exit criteria:** `pi install ./pipal-a2a` → tool appears in pi session.

---

## Phase 2: Fix SDK Purity + Dependency Direction ✅

- [x] Move `SkillMatcher` from `sdk/index.ts` to `src/builtin/skill-matcher.ts`
- [x] SDK contains ZERO function bodies with logic
- [x] Split `src/application/index.ts` into `registry.ts`, `router.ts`, `agent.ts`
- [x] Fix `Agent.handleDelegate` — use injected Transport, not dynamic import
- [x] Application layer has ZERO imports from infrastructure

**Exit criteria:** `tsc --noEmit` passes. SDK has only types/interfaces. Application never imports infrastructure.

---

## Phase 3: Implement PiAgentRuntime

- [ ] Create `src/infrastructure/pi-runtime.ts`
- [ ] Implement `AgentRuntime` interface using `createAgentSession()` from pi SDK
- [ ] Each peer agent creates its own pi session for LLM execution
- [ ] Task payload → pi session → LLM response → TaskResult
- [ ] Error handling: session creation failure, timeout, malformed response

**Exit criteria:** Agent A sends task → Agent B creates real `createAgentSession()` → LLM processes it → result flows back.

---

## Phase 4: Network Bootstrap + Config

- [ ] Create `src/application/network.ts` — factory function
- [ ] `bootstrapNetwork(configPath?)` returns `{ delegate(), listAgents(), shutdown() }`
- [ ] Shared by both extension entry point and CLI
- [ ] Config optional — sensible defaults work with zero config
- [ ] Port auto-assignment (no hardcoded ports)
- [ ] Graceful startup/shutdown

**Exit criteria:** Both CLI and pi extension use same `bootstrapNetwork()`. Works with zero config file.

---

## Phase 5: Tests (Three Layers)

- [x] Layer 1: Core type tests (no mocks, no registry)
- [ ] Layer 2: Registry tests with stub AgentRuntime
- [ ] Layer 2: Router tests with stub registry
- [ ] Layer 2: Agent message handling tests
- [ ] Layer 3: E2E — 2 real agents, real HTTP, real task exchange
- [ ] Protocol compliance assertions in every implementation

**Exit criteria:** `npm test` runs all 3 layers with zero mocks. Stubs are real minimal implementations.

---

## Phase 6: Dashboard + Polish

- [ ] SSE stream from LocalMessageBus → pi extension TUI widget
- [ ] `/pipal-dashboard` command shows live agent status
- [ ] Real-time task progress in pi footer/status bar
- [ ] README matches actual CLI commands and config format
- [ ] Clean git history
- [ ] LICENSE (MIT)
- [ ] CONTRIBUTING.md

**Exit criteria:** Dashboard shows peer-to-peer events in real-time inside pi TUI.

---

## Future (v2+)

These are NOT in v1. Add only when real users need them:

| Feature | Why to skip at v1 |
|---------|-------------------|
| Agent heartbeat / liveness | No consumer exists yet |
| Task retry / recovery | No failure scenarios observed yet |
| Distributed Shared State (Redis) | Single-machine is fine for v1 |
| Agent marketplace / third-party extensions | Own team only at v1 |
| Hot reload of agents | Restart is acceptable |
| Task cancellation | No long-running tasks yet |
| Streaming task results | SSE covers updates, full streaming is premature |

---

## Non-Goals (v1)

- ❌ Central orchestrator (this is P2P!)
- ❌ MCP for agent communication
- ❌ Third-party extension/plugin system
- ❌ LangGraph conditional routing
- ❌ Multi-language agents

---

## Success Criteria

1. **Installable:** `pi install pipal-a2a` works
2. **One tool:** LLM calls `pipal_a2a_delegate()` → task routes to peer → result returns
3. **Real LLM:** Peer agents use `createAgentSession()` for actual execution
4. **P2P:** Any peer can message any other without central coordinator
5. **Observable:** `/pipal-status` shows live agent network
6. **Tested:** Three test layers, zero mocks

---

## Architecture Reference

```
pi-coding-agent (OFFICIAL BASE)
         ▲
         │ installs as extension
         │
┌────────────────────────────────────────────────────┐
│              PiPal-A2A (EXTENSION)                 │
│                                                    │
│   src/extension/index.ts                           │
│   └── export default function(pi: ExtensionAPI)   │
│       ├── pi.registerTool("pipal_a2a_delegate")   │
│       ├── pi.registerCommand("/pipal-status")     │
│       └── pi.on("session_start", bootstrap)       │
│                                                    │
│   src/application/network.ts                       │
│   └── bootstrapNetwork() → shared by all          │
│                                                    │
│   ┌────────────────────────────────────────────┐  │
│   │         SHARED STATE                       │  │
│   │   task, steps, artifacts (HTTP + SSE)       │  │
│   └────────────────────────────────────────────┘  │
│                         │                          │
│              ┌─────────┬─────────┬─────────┐       │
│              │    A    │    B    │    C    │       │
│              │ planner │ worker  │ reviewer│       │
│              │   pi    │   pi    │   pi    │       │
│              │ session │ session │ session │       │
│              └─────────┴─────────┴─────────┘       │
└────────────────────────────────────────────────────┘
```
