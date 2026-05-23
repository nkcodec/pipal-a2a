# PiPal-A2A

**P2P multi-agent orchestration — each pi terminal IS an agent.**

Google A2A v1.0 compliant. Crash-safe SQLite persistence. Smart routing. Real-time streaming.

## Quick Start

```bash
# Install
cd pipal-a2a
npm install

# Terminal 1 — planner (becomes HOST)
PIPAL_ROLE=planner pi

# Terminal 2 — backend agent (JOINs)
PIPAL_ROLE=backend pi

# Terminal 3 — frontend agent (JOINs)
PIPAL_ROLE=frontend pi

# In planner terminal:
pipal_a2a_delegate({ task: "Create /tmp/hello.txt with content 'hello from A2A'", to: "backend" })
```

## How It Works

```
┌──────────┐    delegate    ┌──────────┐
│ Planner  │ ──────────────►│ Backend  │
│ (HOST)   │ ◄──────────────│ (JOIN)   │
└──────────┘    result      └──────────┘
     │                            │
     │ delegate                   │ delegate
     ▼                            ▼
┌──────────┐               ┌──────────┐
│ Reviewer │               │ Frontend │
└──────────┘               └──────────┘
```

- **Star topology** — first agent becomes HOST, others JOIN
- **Crash-safe** — SQLite (node:sqlite) persists agents, tasks, configs across restarts
- **Auto-reconnect** — SSE clients reconnect with exponential backoff
- **Smart routing** — delegate by role, skill, or agent name
- **Workflow mode** — multi-step workflows defined in `config/team.yaml`
- **Streaming** — see results as they arrive via SSE
- **Task Clarity Guard** — rejects vague tasks ("build something cool")
- **Multi-turn** — agents can ask clarifying questions (INPUT_REQUIRED)

## Features

| Feature | Description |
|---------|-------------|
| **P2P delegation** | Any agent can delegate to any other |
| **Crash recovery** | SQLite WAL mode — agents, tasks, push configs survive restart |
| **Smart routing** | Tag-based, skill-based, or direct routing via SmartRouter |
| **Workflows** | Multi-step workflows (backend → reviewer → frontend) |
| **Streaming** | Real-time result streaming via SSE |
| **Multi-turn** | Agents ask clarifying questions, planner responds |
| **Task Clarity** | Rejects vague tasks with Wh-questions |
| **MemPalace** | Optional agent memory via MCP (disabled by default) |
| **.env support** | API keys and secrets outside git |

## Crash Recovery

If the HOST server crashes:
1. All agent/task/push config data survives in SQLite (`.pipal-a2a/state.db`)
2. Agent SSE connections drop → clients auto-reconnect with exponential backoff
3. On reconnect, agents re-register (upsert) — server returns `{recovered: true}`
4. In-flight tasks remain in `WORKING` state — agents pick them up on reconnect
5. Task history and artifacts preserved through crash

**What's NOT recovered** (runtime-only by design):
- SSE connections — TCP connections can't survive restart
- Task locks — Promise mutexes are runtime-only
- Task streams — SSE streams are runtime-only

```bash
# Crash recovery is automatic. Just restart the terminal.
PIPAL_ROLE=planner pi   # server restarts, opens state.db, everything's there
```

## Configuration

### `config/pipal-a2a.yaml`

```yaml
# Shared state rendezvous URL
sharedState: http://localhost:5000

# Agent role (from config/team.yaml)
role: planner

# SQLite database path (default: .pipal-a2a/state.db)
# dbPath: ".pipal-a2a/state.db"

# Server bind address
# "127.0.0.1" — localhost only (default, secure)
# "0.0.0.0"   — all interfaces (multi-machine, requires apiKey!)
# host: "127.0.0.1"

# MemPalace — agent memory (OFF by default)
mempalace:
  enabled: false
  wing: "wing_pipal_a2a"
  sharedRoom: "shared"
```

### `config/team.yaml`

```yaml
team:
  roles:
    planner:
      name: planner
      skills: [planning, delegation]
      tags: [plan, architecture, design]
    backend:
      name: backend
      skills: [code-generation, backend-implementation]
      tags: [node.js, express, api, backend]
    frontend:
      name: frontend
      skills: [frontend-implementation]
      tags: [react, tailwind, typescript]
    reviewer:
      name: reviewer
      skills: [code-review, security-review]
      tags: [security, review]
```

### `.env`

```bash
PIPAL_API_KEY=your-secret-key
```

## Agent Roles

| Role | Skills | When to delegate |
|------|--------|-----------------|
| **planner** | planning, delegation | You (orchestrator) |
| **backend** | code-generation, backend-implementation | APIs, servers, databases |
| **frontend** | frontend-implementation | React, CSS, UI |
| **reviewer** | code-review, security-review | Code review, quality |
| **data** | data-processing, embeddings | Data pipelines, ChromaDB |
| **security** | security-audit | Security audits, hardening |

## Tools

| Tool | Description |
|------|-------------|
| `pipal_a2a_delegate` | Delegate task to another agent |
| `pipal_a2a_agents` | List online agents |
| `pipal_a2a_my_card` | Show your agent card |
| `pipal_a2a_status` | Network health check |
| `pipal_a2a_ask` | Ask follow-up question on delegated task |

## Tests

```bash
npm test        # 163 tests, 16 files
```

## Architecture

```
src/
├── core/types.ts              # Frozen — A2A v1.0 data model, StoredTask
├── sdk/index.ts               # Public API surface (types + factory functions)
├── application/
│   ├── registry.ts            # Agent registry (coordinates storage)
│   ├── router.ts              # Task router (strategy pattern)
│   └── network.ts             # Network helpers
├── infrastructure/
│   ├── shared-state.ts        # HTTP server + client (JSON-RPC + SSE)
│   ├── state-store.ts         # SQLite persistence (node:sqlite, WAL mode)
│   └── jsonrpc.ts             # JSON-RPC 2.0 dispatcher
├── builtin/
│   ├── smart-router.ts        # Tag + skill + keyword routing
│   └── skill-matcher.ts       # Simple skill-based matching
├── extension/
│   └── index.ts               # Pi extension entry point (tools + lifecycle)
└── cli/index.ts               # CLI commands
```

### Layer Rules (karpathy-clean-code)

```
Core (frozen)     → no imports from any other layer
SDK               → re-exports core types + protocol interfaces (types only)
Application       → coordinates flow, no business logic
Infrastructure    → implementations (HTTP, SQLite, JSON-RPC)
Builtin           → default implementations (SmartRouter, SkillMatcher)
Extension         → pi extension wiring (entry point)
```

### Star Topology

```
  planner (HOST + Shared State Server)
  ┌──────────────────────┐
  │  localhost:5000       │
  │  SQLite + JSON-RPC    │
  │  + SSE                │
  └──┬───┬───┬────────────┘
     │   │   │
 back rev front (all JOIN as clients)
```

First agent to start becomes HOST (runs server). Others JOIN.
All traffic routes through HOST. If HOST dies, network dies.
This is correct for 3-5 agents on localhost — true P2P mesh is YAGNI.

## Performance

| Operation | 50 agents, 100 tasks | 3-5 agents (real use) |
|-----------|---------------------|----------------------|
| Health endpoint | 0.9ms | <1ms |
| Register agent | 1.2ms | <1ms |
| Create task | 2.1ms | <1ms |
| Resolve task | 1.8ms | <1ms |
| List agents | 0.8ms | <1ms |

## License

MIT
