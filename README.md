# PiPal-A2A

**P2P multi-agent orchestration — each pi terminal IS an agent.**

Google A2A v1.0 compliant. No central orchestrator. Agents discover, delegate, and collaborate peer-to-peer.

## Quick Start

```bash
# Install
cd pipal-a2a
npm install

# Terminal 1 — start backend agent
PIPAL_ROLE=backend pi

# Terminal 2 — start planner (you)
PIPAL_ROLE=planner pi

# In planner terminal:
pipal_a2a_delegate({ task: "Create /tmp/hello.txt with content 'hello from A2A'", to: "backend" })
```

## How It Works

```
┌──────────┐    delegate    ┌──────────┐
│ Planner  │ ──────────────►│ Backend  │
│ (you)    │ ◄──────────────│          │
└──────────┘    result      └──────────┘
     │                            │
     │ delegate                   │ delegate
     ▼                            ▼
┌──────────┐               ┌──────────┐
│ Reviewer │               │ Frontend │
└──────────┘               └──────────┘
```

- **No central server** — agents connect via shared state (SSE)
- **Smart routing** — delegate by role, skill, or agent name
- **Workflow mode** — multi-step workflows defined in `config/team.yaml`
- **Streaming** — see results as they arrive
- **Task Clarity Guard** — rejects vague tasks ("build something cool")

## Features

| Feature | Description |
|---------|-------------|
| **P2P delegation** | Any agent can delegate to any other |
| **Smart routing** | Tag-based, skill-based, or direct routing |
| **Workflows** | Multi-step workflows (backend → reviewer → frontend) |
| **Streaming** | Real-time result streaming via SSE |
| **Task Clarity** | Rejects vague tasks with Wh-questions |
| **MemPalace** | Optional agent memory via MCP (disabled by default) |
| **.env support** | API keys and secrets outside git |

## Configuration

### `config/pipal-a2a.yaml`

```yaml
# Shared state rendezvous URL
sharedState: http://localhost:5000

# Agent role (from config/team.yaml)
role: planner

# MemPalace — agent memory (OFF by default)
# Per karpathy-clean-code: Config activates, not defines.
mempalace:
  enabled: false
  wing: "wing_a2a"      # your project wing name
  sharedRoom: "shared"
```

### `config/team.yaml`

```yaml
roles:
  planner:
    name: planner
    skills: [planning, delegation]
    tags: [plan, architecture, design]
  backend:
    name: backend
    skills: [code-generation, backend-implementation]
    tags: [node.js, express, api, backend]
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
| **reviewer** | code-review | Code review, quality |
| **data** | data-processing, embeddings | Data pipelines, ChromaDB |
| **security** | security-audit | Security audits, hardening |

## MemPalace Integration (Optional)

MemPalace gives agents shared memory and knowledge graph. **Disabled by default.**

To enable:

```yaml
mempalace:
  enabled: true
  wing: "wing_my_project"   # your project wing
  sharedRoom: "shared"
```

When enabled:
- Agents call MemPalace tools after completing tasks
- Results stored in shared wing (cross-agent knowledge)
- Planner gets reminder to verify MemPalace was called
- If MemPalace fails → agents report `MEMPALACE FAILED` to planner

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
npm test        # 145 tests
```

## Architecture

```
Star topology (hub-and-spoke):

  planner (HOST + Shared State Server)
  ┌──────────────────────┐
  │  localhost:5000       │
  │  JSON-RPC + SSE       │
  └──┬───┬───┬────────────┘
     │   │   │
 back rev front (all JOIN as clients)
```

First agent to start becomes HOST (runs server). Others JOIN.
All traffic routes through HOST. If HOST dies, network dies.
This is correct for 3-5 agents on localhost — true P2P mesh is YAGNI.

## License

MIT
