# PiPal-A2A

**Each pi terminal IS an agent.** P2P multi-agent orchestration where real pi sessions collaborate in real-time.

## What is PiPal-A2A?

A **pi extension** that turns every pi terminal into a node in a P2P agent network. Open multiple terminals, give each a role (planner, coder, reviewer), and watch them collaborate — you see each agent thinking, writing code, and running tools in real-time.

**One sentence core:** Route tasks to specialized LLM agents via P2P delegation and return results.

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
[pipal-a2a] ✅ Online as "planner" with skills: [planning, delegation]
```

### 3. Open Terminal 2 (backend worker) — joins the network

```bash
PIPAL_NAME=backend PIPAL_SKILLS=code-generation,backend-implementation pi
```

You'll see:
```
[pipal-a2a] 🔗 JOIN mode — connecting to http://localhost:5000
[pipal-a2a] ✅ Online as "backend" with skills: [code-generation, backend-implementation]
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
# 3 agent(s) online:
#   → planner: [planning, delegation] (you)
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

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│  CORE (frozen — pure data types, zero imports)           │
│  A2AMessage, TaskResult, AgentCard, Skill                │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  SDK (interfaces + types only — zero implementation)     │
│  AgentRegistry, TaskRouter, RoutingStrategy              │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  BUILTIN (default implementations)                       │
│  SkillMatcher — routes tasks by skill matching           │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE (real I/O)                               │
│  shared-state.ts — rendezvous HTTP server + SSE client   │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  APPLICATION (coordinates flow, no business logic)        │
│  registry.ts, router.ts — local agent tracking + routing │
└─────────────────────────────────────────────────────────┘
                         ▲
┌─────────────────────────────────────────────────────────┐
│  EXTENSION (pi entry point — registers tools + commands)  │
│  Tool: pipal_a2a_delegate, Command: /pipal-status        │
└─────────────────────────────────────────────────────────┘
```

## File Structure

```
pipal-a2a/
├── src/
│   ├── core/types.ts              # Frozen core — pure data types
│   ├── sdk/index.ts               # Public API — interfaces only
│   ├── builtin/skill-matcher.ts   # Default routing strategy
│   ├── infrastructure/
│   │   └── shared-state.ts        # HTTP rendezvous server + client
│   ├── application/
│   │   ├── registry.ts            # Local agent registry
│   │   ├── router.ts              # Task routing by skill
│   │   └── network.ts             # Network type helpers
│   ├── extension/index.ts         # pi extension entry point
│   └── cli/index.ts               # Standalone shared state server
├── config/
│   └── pipal-a2a.yaml             # Per-terminal config
├── tests/
│   └── core.test.ts               # Layer 1 tests (no mocks)
├── package.json
└── README.md
```

## Key Design Decisions

| Decision | Why |
|----------|-----|
| **Each pi terminal IS an agent** | Real parallelism, real context per agent, real tools per agent |
| **Shared state = rendezvous** | Simple HTTP server for discovery + message passing, not orchestration |
| **Not MCP** | MCP is for tool integration; A2A is for agent coordination |
| **SSE for real-time** | Agents see each other join/leave/tasks in real-time |
| **Auto HOST/JOIN** | First terminal starts server, others connect — zero manual setup |
| **One tool** | `pipal_a2a_delegate(task, skill?, to?)` — simplicity wins |

## karpathy-clean-code Compliance

- ✅ **Core frozen** — `types.ts` has ZERO imports from other layers
- ✅ **SDK = types only** — interfaces, no implementation
- ✅ **Builtin implements SDK** — SkillMatcher is outside SDK
- ✅ **No synthetic runtime** — pi IS the runtime, no `createAgentSession()` wrapper
- ✅ **Each terminal = real agent** — true parallelism, not multiplexed in one process
- ✅ **Real-time visibility** — users see agents working in their own terminals

## Status

**🔬 Experimental** — P2P agent coordination where each pi terminal IS an agent
