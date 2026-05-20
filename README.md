# PiPal-A2A

**P2P multi-agent orchestration for [pi](https://github.com/earendilworks/pi-coding-agent) — each terminal IS an agent.**

Turn multiple pi terminals into a coordinated agent team. No central server, no message queue — just terminals talking to each other via the Google A2A v1.0 protocol.

```
Terminal 1 (planner):  "Build me a todo app"
  └─→ delegates to backend + frontend
Terminal 2 (backend):  builds the API
Terminal 3 (frontend): builds the UI
  └─→ results flow back to planner
```

## Install

```bash
# From npm (when published)
pi install npm:pipal-a2a

# From GitHub
pi install git:github.com/YOUR_USERNAME/pipal-a2a

# Try without installing
pi -e git:github.com/YOUR_USERNAME/pipal-a2a

# Local development
pi install ./path/to/pipal-a2a
```

### 2. Open terminals

Each terminal gets an identity via environment variables:

```bash
# Terminal 1 — planner (first terminal auto-starts the network)
PIPAL_NAME=planner PIPAL_SKILLS=planning,delegation PIPAL_TAGS=plan,architecture pi

# Terminal 2 — backend
PIPAL_NAME=backend PIPAL_SKILLS=code-generation,backend-implementation PIPAL_TAGS=node.js,api pi

# Terminal 3 — frontend
PIPAL_NAME=frontend PIPAL_SKILLS=frontend-implementation PIPAL_TAGS=react,css,ui pi
```

### 3. Delegate tasks

In the planner terminal:

```
> "Build me a REST API with JWT auth"
```

The LLM automatically:
1. Checks `pipal_a2a_agents()` — sees who's online
2. Checks `pipal_a2a_my_card()` — knows its own role
3. Calls `pipal_a2a_delegate(to="backend", task="...")` — delegates to the right agent

The backend terminal receives the task, processes it, and sends the result back. You see it all happen in real-time.

## Tools

PiPal-A2A registers 4 tools in your pi session:

| Tool | What |
|------|------|
| `pipal_a2a_delegate(task, to?, skill?)` | Send a task to another agent |
| `pipal_a2a_agents()` | List all online agents |
| `pipal_a2a_my_card()` | Show your own agent card |
| `pipal_a2a_status()` | Check network health |

## Project Isolation

**Different projects = different networks.** Auto-detected from your working directory.

```bash
cd ~/projects/todo-app && pi     → port 5016 (todo-app agents only)
cd ~/projects/weather-app && pi  → port 5006 (weather-app agents only)
```

Override: `PIPAL_SHARED_STATE=http://localhost:5500 pi`

## Auth

Optional API key for your network:

```bash
PIPAL_API_KEY=secret123 pi    # All terminals must use the same key
```

Without `PIPAL_API_KEY` — open network (fine for local dev).

## Config File

Instead of env vars, create `config/pipal-a2a.yaml`:

```yaml
sharedState: http://localhost:5000
identity:
  name: planner
  description: "Plans tasks and delegates to workers"
  skills:
    - planning
    - delegation
```

Env vars always override the config file.

## Architecture

```
┌─────────────┐     ┌─────────────────────────┐     ┌─────────────┐
│  Terminal 1  │────▶│   SharedStateServer     │◀────│  Terminal 2  │
│  (planner)   │     │   (auto-started by      │     │  (backend)   │
│              │◀────│    first terminal)       │────▶│              │
└─────────────┘     │                         │     └─────────────┘
                    │  • Agent registration   │
                    │  • Task CRUD            │
                    │  • SSE streaming         │
                    │  • Push notifications   │
                    │  • JSON-RPC 2.0         │
                    │  • Well-known discovery │
                    └─────────────────────────┘
```

**Clean architecture (karpathy-clean-code):**

| Layer | What | Changes |
|-------|------|---------|
| `src/core/` | Google A2A v1.0 types | Frozen — never touched |
| `src/sdk/` | Public interfaces | Frozen — extensions use this |
| `src/application/` | Registry, router | Rarely |
| `src/infrastructure/` | HTTP, SSE, JSON-RPC | Per feature |
| `src/extension/` | pi extension glue | Per feature |

## Features

| Feature | Status | Version |
|---------|--------|---------|
| JSON-RPC 2.0 binding | ✅ | v0.1.1 |
| Streaming (SSE) | ✅ | v0.1.2 |
| Multi-turn (contextId) | ✅ | v0.1.3 |
| Auth (API key) | ✅ | v0.1.4 |
| Well-known discovery | ✅ | v0.1.5 |
| Push notifications (webhook) | ✅ | v0.1.6 |
| Auto-Router (tag-based) | ✅ | v0.1.7 |
| Project isolation (auto-port) | ✅ | v0.2.0 |

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `PIPAL_NAME` | Recommended | Agent name (auto-generated if omitted) |
| `PIPAL_SKILLS` | Recommended | Comma-separated skill IDs |
| `PIPAL_TAGS` | Optional | Comma-separated tags for SmartRouter |
| `PIPAL_DESCRIPTION` | Optional | Agent description |
| `PIPAL_API_KEY` | Optional | Shared network API key |
| `PIPAL_SHARED_STATE` | Optional | Override shared state URL (default: auto from cwd) |

## Development

```bash
# Run tests
npm test

# 98 tests covering all layers
```

## License

MIT
