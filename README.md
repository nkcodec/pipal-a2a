# PiPal-A2A

**P2P multi-agent orchestration built on `pi-coding-agent`**

## What is PiPal-A2A?

PiPal-A2A is an **extension** for the official `pi-coding-agent`. It adds:
- P2P agent communication (A2A protocol)
- Shared State for coordination
- Domain-organized agents

## Official Base

```
┌─────────────────────────────────────────────────────────┐
│          pi-coding-agent (OFFICIAL)                     │
│                                                          │
│   Provides:                                             │
│   - createPiAgentSession() — creates Pi Sessions        │
│   - Pi Sessions — LLM execution environment              │
│   - Tools: read, bash, edit, write                     │
│                                                          │
│   npm: @earendil-works/pi-coding-agent                 │
└─────────────────────────────────────────────────────────┘
                           ▲
                           │ extends
                           │
┌─────────────────────────────────────────────────────────┐
│              PiPal-A2A (EXTENSION)                     │
│                                                          │
│   Provides:                                             │
│   - P2P coordination (A2A messages)                    │
│   - Shared State (blackboard)                           │
│   - Domain-organized agents                              │
│                                                          │
│   Uses:                                                 │
│   - createPiAgentSession() from official                │
│   - Pi Sessions for LLM execution                       │
└─────────────────────────────────────────────────────────┘
```

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    USER INTERFACE                         │
│                                                          │
│   User calls:                                           │
│   → pipal_a2a_delegate(task: "Build login API")        │
│                                                          │
│   This is a tool function provided by PiPal-A2A         │
│   PiPal-A2A uses pi-coding-agent internally             │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTP + SSE
                         ▼
┌─────────────────────────────────────────────────────────┐
│              SHARED STATE (HTTP Server)                 │
│                                                          │
│   ┌────────────────────────────────────────────────┐   │
│   │  task: "Build login API"                      │   │
│   │  steps: [                                      │   │
│   │    { agent: "planner", status: "done" },      │   │
│   │    { agent: "worker", status: "running" },   │   │
│   │  ]                                              │   │
│   │  artifacts: { "login.ts": "..." }             │   │
│   └────────────────────────────────────────────────┘   │
│                                                          │
│   SSE: /events — real-time updates to all peers        │
└─────────────────────────────────────────────────────────┘
                         │
                         │ HTTP
                         ▼
┌─────────────────────────────────────────────────────────┐
│                    P2P NETWORK                          │
│                                                          │
│   Each peer uses pi-coding-agent:                       │
│                                                          │
│   ┌─────────┐              ┌─────────┐              ┌─────────┐
│   │   A     │ ◄── A2A ──► │   B     │ ◄── A2A ──► │   C     │
│   │ planner │              │ worker  │              │ reviewer│
│   └────┬────┘              └────┬────┘              └────┬────┘
│        │                         │                          │
│        │ Pi Session             │ Pi Session               │ Pi Session
│        │ (pi-coding-agent)      │ (pi-coding-agent)        │ (pi-coding-agent)
│        ▼                        ▼                          ▼
│   ┌─────────┐             ┌─────────┐             ┌─────────┐
│   │ A calls │             │ B calls │             │ C calls │
│   │ LLM     │             │ LLM     │             │ LLM     │
│   └─────────┘             └─────────┘             └─────────┘
└─────────────────────────────────────────────────────────┘
```

## Flow

```
1. User → pipal_a2a_delegate(task)
          │
          ▼
2. PiPal-A2A → writes task to Shared State
          │
          ▼
3. ALL PEERS → read Shared State (see new task via SSE)
          │
          ▼
4. AGENT A (planner) → uses pi-coding-agent
   - Creates Pi Session
   - Decides: "Worker B should implement"
   - Writes to Shared State
          │
          ▼
5. AGENT A → A2A message to Agent B
          │
          ▼
6. AGENT B → uses pi-coding-agent
   - Creates Pi Session
   - Executes task (LLM)
   - Writes result to Shared State
          │
          ▼
7. Dashboard (SSE) → shows real-time progress
          │
          ▼
8. User sees: "Login API built, reviewed, done"
```

## Key Points

| Component | Protocol | What it does |
|-----------|----------|--------------|
| **pi-coding-agent** | Official | Creates Pi Sessions, LLM execution |
| **PiPal-A2A** | Extension | P2P coordination, Shared State |
| **Shared State** | HTTP | Holds task, steps, artifacts |
| **P2P Network** | A2A | Agents exchange messages |
| **Dashboard** | SSE | Real-time visualization |

## Not MCP!

PiPal-A2A does **NOT** use MCP for agent communication. It uses:
- **HTTP** — for Shared State read/write
- **A2A** — for peer-to-peer messages
- **SSE** — for real-time updates
- **pi-coding-agent SDK** — for LLM execution

## Example Usage

```bash
# Via pi-coding-agent + PiPal-A2A extension
pi task "Build login API" --extension pipal-a2a
```

```typescript
// Or via SDK
import { pipal_a2a_delegate } from "pipal-a2a";

const result = await pipal_a2a_delegate({
  task: "Build login API",
  workflow: "e-commerce"
});
```

## karpathy-clean-code Compliance

- ✅ **Core frozen** — `types.ts` has ZERO imports from other layers
- ✅ **SDK = types only** — no implementation in `sdk/index.ts`
- ✅ **Infrastructure implements SDK interfaces**
- ✅ **Extension is built ON TOP of official, not inside it**
- ✅ **No MCP for agent communication**

## Status

**🔬 Experimental** — P2P coordination layer on top of `pi-coding-agent`