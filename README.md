# PiPal-A2A

**Each pi terminal IS an agent.** P2P multi-agent orchestration via Google A2A v1.0 — watch real pi sessions collaborate in real-time.

> **v0.1.4 shipped** — 49 commits on `master`. API key auth. Multi-turn. Streaming. JSON-RPC 2.0.

## What is PiPal-A2A?

A **pi extension** that turns every pi terminal into a node in a P2P agent network. Open multiple terminals, give each a role (planner, coder, reviewer), and watch them collaborate — you see each agent thinking, writing code, and running tools in real-time.

**Core sentence:** Route tasks to specialized LLM agents via P2P delegation and return results.

**Protocol:** [Google A2A v1.0](https://github.com/google/A2A) data model — `AgentCard`, `Task`, `Message`, `Artifact`, `Part`, `TaskState`.

## How It Works

```
Terminal 1 (frontend)            Terminal 2 (backend)              Terminal 3 (planner)
┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ $ pi                 │         │ $ pi                 │         │ $ pi                 │
│                      │         │                      │         │                      │
│ You: "Build a todo  │         │ You see nothing yet  │         │ You see nothing yet  │
│ app"                │         │                      │         │                      │
│                      │         │                      │         │                      │
│ LLM: decides to      │  task   │ 📩 Delegated task    │         │                      │
│ delegate to backend  │───────►│ from frontend:       │         │                      │
│ (skill match)        │         │ "Build REST API"     │         │                      │
│                      │         │                      │         │                      │
│ ⏳ Waiting for       │         │ LLM: writes server,  │  done   │                      │
│ backend result...    │         │ runs npm, tests      │─────────│                      │
│                      │         │ (you see all in      │         │                      │
│                      │         │ real-time)           │         │                      │
│                      │◄────────│                      │         │                      │
│ LLM: Got API done.  │         │                      │         │                      │
│ Building UI now...   │         │                      │         │                      │
│                      │         │                      │         │                      │
│ LLM: writes React   │         │                      │         │                      │
│ components, runs     │         │                      │         │                      │
│ npm build            │         │                      │         │                      │
│                      │         │                      │         │                      │
│ ✅ Todo app done.    │         │                      │         │                      │
│ Backend + Frontend  │         │                      │         │                      │
│ both complete.       │         │                      │         │                      │
└──────────────────────┘         └──────────────────────┘         └──────────────────────┘
```

**Auto-Router (v0.1.7):** Agents delegate automatically by tag — no human telling whom to delegate to.


## Quick Start

### 1. Install the extension

```bash
pi install ./pipal-a2a
```

### 2. Open Terminal 1 (planner) — auto-starts the network

```bash
PIPAL_NAME=planner PIPAL_SKILLS=planning,delegation pi
```

You'll see:
```
[pipal-a2a] 🏠 HOST mode — shared state at http://localhost:5000
[pipal-a2a] ✅ Online as "planner" [planning, delegation]
```

### 3. Open Terminal 2 (backend worker) — joins the network

```bash
PIPAL_NAME=backend PIPAL_SKILLS=code-generation,backend-implementation pi
```

You'll see:
```
[pipal-a2a] 🔗 JOIN mode — connecting to http://localhost:5000
[pipal-a2a] ✅ Online as "backend" [code-generation, backend-implementation]
```

And Terminal 1 prints:
```
[pipal-a2a] 👋 backend joined the network
```

### 4. Open Terminal 3 (security reviewer) — joins too

```bash
PIPAL_NAME=reviewer PIPAL_SKILLS=security-review,code-review pi
```

All terminals now show:
```
/pipal-status
# 3 agent(s) online (A2A v1.0):
#   → planner: [planning, delegation] (you) JSONRPC
#     backend: [code-generation, backend-implementation]
#     reviewer: [security-review, code-review]
```

### 5. Delegate tasks!

In Terminal 1:
```
> "Build me a login API with JWT auth, then review it for security"
```

The LLM calls `pipal_a2a_delegate()`:
- **Terminal 2** receives: `📩 Delegated task from planner: "Implement login API with JWT auth"`
  - You **see** the LLM reading files, writing code, running tests — **in real-time**
- **Terminal 3** receives: `📩 Delegated task from planner: "Review for security"`
  - You **see** the LLM analyzing code, finding vulnerabilities — **in real-time**
- **Terminal 1** receives the results and continues the conversation

### Config file (alternative to env vars)

Create `config/pipal-a2a.yaml` for defaults:

```yaml
sharedState: http://localhost:5000
identity:
  name: planner
  description: "Plans tasks and delegates to workers"
  skills:
    - planning
    - delegation
```

Environment variables always override the config file.

### Environment Variables

| Variable | What it sets | Example |
|----------|-------------|---------|
| `PIPAL_NAME` | Agent identity name | `PIPAL_NAME=planner` |
| `PIPAL_SKILLS` | Comma-separated skill IDs | `PIPAL_SKILLS=code-generation,backend` |
| `PIPAL_DESCRIPTION` | Agent description | `PIPAL_DESCRIPTION="Backend specialist"` |
| `PIPAL_SHARED_STATE` | Shared state URL | `PIPAL_SHARED_STATE=http://localhost:5000` |

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CORE — Google A2A v1.0 Data Model (frozen)             │
│  Task, TaskState, Message, Part, Artifact,               │
│  AgentCard, AgentSkill, AgentCapabilities,               │
│  AgentInterface, AgentProvider                           │
│  Zero imports from other layers                          │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  SDK — Interfaces Only (zero implementation)             │
│  AgentRegistry, TaskRouter, RoutingStrategy              │
│  Re-exports all core types + factories                   │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  BUILTIN — Default Implementations                       │
│  SmartRouter — routes by tag matching, LLM decides first │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE — Real I/O                               │
│  shared-state.ts — HTTP rendezvous server + SSE client   │
│  Uses Task lifecycle: SUBMITTED → WORKING → COMPLETED    │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  APPLICATION — Flow Coordination (no business logic)     │
│  registry.ts — local AgentCard tracking                  │
│  router.ts — client-side task routing (Google A2A style) │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  EXTENSION — Pi Entry Point                              │
│  pipal_a2a_delegate tool, /pipal-status command          │
│  HOST/JOIN auto-detect, SSE subscription, delegation     │
└─────────────────────────────────────────────────────────┘
```

**Layer rules (dependency direction always downward):**
- Core → imports nothing
- SDK → imports Core types only
- Builtin → imports SDK interfaces only
- Infrastructure → imports SDK + Core
- Application → imports SDK + Core + Builtin (never Infrastructure)
- Extension → imports Application + Infrastructure (top-level wiring)

## File Structure

```
pipal-a2a/
├── src/
│   ├── core/
│   │   └── types.ts              # Google A2A v1.0 data model (frozen)
│   ├── sdk/
│   │   └── index.ts              # Public API — interfaces only
│   ├── builtin/
│   │   └── skill-matcher.ts      # Default routing strategy
│   ├── infrastructure/
│   │   └── shared-state.ts       # HTTP rendezvous server + SSE client
│   ├── application/
│   │   ├── registry.ts           # In-memory AgentCard registry
│   │   ├── router.ts             # Client-side task routing
│   │   └── network.ts            # Network type helpers
│   ├── extension/
│   │   └── index.ts              # pi extension entry point
│   └── cli/
│       └── index.ts              # Standalone shared state server
├── config/
│   └── pipal-a2a.yaml            # Per-terminal config
├── tests/
│   └── core.test.ts              # Layer 1: A2A spec compliance tests
├── package.json                  # pi extension config
├── tsconfig.json
└── vitest.config.ts
```

## Task Lifecycle (Google A2A)

```
Client (Terminal A)              Shared State              Agent (Terminal B)
─────────────────              ──────────────              ─────────────────
                                                                 
1. Create Task ──────────────► TASK_STATE_SUBMITTED
                                          
                              broadcast SSE ──────────────► 2. Agent receives
                                                                 task via SSE
                              ◄──────────────────────────── 3. Agent processes
                                                              (LLM works — user
                                                               sees it live!)
                                                             
                              TASK_STATE_WORKING
                              
                              ◄──────────────────────────── 4. Agent posts result
                                                              as Artifact with
                                                              Part[] (A2A spec)
                              
                              TASK_STATE_COMPLETED
                              
5. Poll/Wait ◄────────────── Task with Artifact[]

6. LLM continues conversation with result
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Google A2A v1.0 data model** | Interoperability, future-proof, honest naming, spec handles hard problems |
| **Each pi terminal IS an agent** | Real parallelism, real context per agent, real tools per agent |
| **REST binding (spec §11)** | Simplest transport for v1, spec explicitly allows it |
| **Shared state rendezvous** | P2P discovery without DNS or registries — perfect for LAN |
| **Not MCP** | MCP is for tool integration; A2A is for agent-to-agent coordination |
| **SSE for real-time** | Spec-compliant streaming, works everywhere |
| **Auto HOST/JOIN** | First terminal starts server, others connect — zero manual setup |
| **One tool** | `pipal_a2a_delegate(task, skill?, to?)` — simplicity wins |
| **No synthetic runtime** | pi IS the runtime — no `createAgentSession()` wrapper needed |

## karpathy-clean-code Compliance

- ✅ **Core frozen** — `types.ts` has ZERO imports, pure Google A2A data model
- ✅ **SDK = types only** — interfaces, no implementation
- ✅ **Builtin implements SDK** — SkillMatcher is outside SDK
- ✅ **No speculative abstractions** — only what we need today
- ✅ **Three test layers** — Core (19 tests, no mocks), Application (stubs), E2E (real HTTP)
- ✅ **Protocol compliance tests** — verifies TaskState format, ISO 8601, AgentCard v1.0 shape

## Status

**🚀 v0.1.0 shipped.** Two pi terminals can discover each other, delegate real tasks, and return results — end-to-end, verified by real testing.

```
Planner (Terminal A)                         Backend (Terminal B)
───────────────────                         ────────────────────
pipal_a2a_delegate                          [idle, watching]
     │                                              │
     ├── Task created ────────► Shared State ◄─────┤
     │ (planner → backend)           │              │
     │                    SSE ────►│              │
     │                              │         📩 Delegated task
     │                              │         sendUserMessage()
     │                              │              │
     │                              │         LLM works (you see it!)
     │                              │              │
     │                              │         agent_end fires
     │                              │◄── Result ───┤
     │                    Task complete            │
     │◄── Poll/wait for result ───┤
     │                              │
     "Result from backend:          │
      Done. Created test.txt"       │
```

**What works:**
- `pipal_a2a_delegate` tool with `to=` and `skill=` routing
- Shared state auto HOST/JOIN (first terminal starts server)
- SSE task delivery to remote terminal
- `pi.sendUserMessage()` task injection
- `message_update` streaming capture
- `agent_end` result posting
- Result polling + display in delegator's terminal
- `/pipal-status` shows live agent network
- Google A2A v1.0 data model throughout
- 51 unit tests passing

**Next:** v0.1.5 — agent card signing + well-known discovery. v0.1.7 — Auto-Router (tag-based, no human delegation).
