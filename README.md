# PiPal-A2A

**Each pi terminal IS an agent.** Google A2A v1.0 compliant P2P multi-agent orchestration — watch real pi sessions collaborate in real-time.

## What is PiPal-A2A?

A **pi extension** that turns every pi terminal into a node in a P2P agent network. Open multiple terminals, give each a role (planner, coder, reviewer), and watch them collaborate — you see each agent thinking, writing code, and running tools in real-time.

**Core sentence:** Route tasks to specialized LLM agents via P2P delegation and return results.

**Protocol:** [Google A2A v1.0](https://github.com/google/A2A) data model — `AgentCard`, `Task`, `Message`, `Artifact`, `Part`, `TaskState`.

## How It Works

```
Terminal 1 (planner)              Terminal 2 (backend)              Terminal 3 (reviewer)
┌──────────────────────┐         ┌──────────────────────┐         ┌──────────────────────┐
│ $ pi                 │         │ $ pi                 │         │ $ pi                 │
│                      │         │                      │         │                      │
│ You: "Build login   │         │ You see nothing yet  │         │ You see nothing yet  │
│ API and review it"   │         │                      │         │                      │
│                      │         │                      │         │                      │
│ LLM: calls           │  task   │ 📩 Delegated task    │         │                      │
│ pipal_a2a_delegate() │───────►│ from planner:        │         │                      │
│                      │         │ "Implement login API"│         │                      │
│ ⏳ Waiting for       │         │                      │         │                      │
│ backend result...    │         │ LLM: reads files,    │  done   │                      │
│                      │         │ writes code, runs    │─────────│                      │
│                      │         │ tests (you see all   │         │                      │
│                      │◄────────│ of this in real-time)│         │                      │
│ LLM: Got result.    │         │                      │         │                      │
│ Now reviewing...     │         │                      │         │                      │
│                      │         │                      │  task   │ 📩 Delegated task    │
│ LLM: calls           │─────────────────────────────────────────►│ from planner:        │
│ pipal_a2a_delegate() │         │                      │         │ "Review for security"│
│                      │         │                      │         │                      │
│ ⏳ Waiting for       │         │                      │         │ LLM: analyzes code,  │
│ reviewer result...   │         │                      │         │ finds issues (you    │
│                      │         │                      │         │ see the analysis!)   │
│                      │◄─────────────────────────────────────────│                      │
│ LLM: Done! Login API│         │                      │         │                      │
│ built + reviewed     │         │                      │         │                      │
└──────────────────────┘         └──────────────────────┘         └──────────────────────┘
                              │
                    ┌─────────┴──────────┐
                    │   Shared State     │
                    │   (HTTP + SSE)     │  ← First terminal auto-starts this
                    │   localhost:5000   │     Others connect to it
                    └────────────────────┘
```

## Google A2A v1.0 Compliance

We use the [Google A2A v1.0](https://github.com/google/A2A) data model for all agent communication:

| Spec Type | What We Use | Status |
|-----------|-------------|--------|
| **AgentCard** | `name`, `supportedInterfaces[]`, `capabilities`, `skills[]` | ✅ Full v1.0 |
| **Task** | `id`, `status`, `history`, `artifacts` | ✅ Full |
| **TaskState** | `TASK_STATE_SUBMITTED/WORKING/COMPLETED/FAILED` | ✅ Full |
| **Message** | `role: ROLE_USER/ROLE_AGENT`, `parts[]`, `messageId` | ✅ Full |
| **Part** | Unified: `text`, `raw`, `url`, `data` + `mediaType` | ✅ Full |
| **Artifact** | `artifactId`, `parts[]`, `name` | ✅ Full |
| **AgentSkill** | `id`, `name`, `description`, `tags`, `examples` | ✅ Full |
| **AgentCapabilities** | `streaming`, `pushNotifications` | ✅ Full |
| **AgentInterface** | `url`, `protocolBinding`, `protocolVersion` | ✅ Full |
| **Transport** | REST binding (spec §11) | ✅ Valid |
| **Agent Discovery** | Shared state rendezvous (v1 simplification) | ⚠️ Custom |
| **Auth** | None (localhost only) | ❌ v0.1.4 |
| **JSON-RPC binding** | REST instead (spec §11 allows) | ⚠️ v0.1.1 |
| **`/.well-known/agent-card.json`** | Shared state instead | ⚠️ v0.1.5 |
| **Multi-turn (`contextId`)** | Single task per delegation | ❌ v0.1.3 |
| **gRPC binding** | Not needed for v1 | ❌ v0.1.7 |

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
│  SkillMatcher — routes tasks by AgentSkill matching      │
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

**🔬 v0.1.0** — Google A2A v1.0 data model, P2P agent coordination, each pi terminal IS an agent.
