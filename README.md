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
- **Workflow mode** — multi-step workflows defined in `.pipal-a2a/team.yaml`
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

### `.pipal-a2a/config.yaml`

> **Convention**: pipal-a2a uses `.pipal-a2a/` (like `.git`, `.zed`, `.github`).
> Copy from `config/*.yaml.example` to get started.

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

### `.pipal-a2a/team.yaml`

```yaml
team:
  roles:
    planner:
      capabilities: [planning, delegation]
      tags: [plan, architecture, design]
      skillGuidelines:
        - "Apply skill karpathy-clean-code: ship smallest correct core..."
        - "When a bug is found: apply skill debug-mantra..."
    backend:
      capabilities: [code-generation, backend-implementation]
      tags: [node.js, express, api, backend]
      skillGuidelines:
        - "Apply skill karpathy-clean-code: core frozen..."
    frontend:
      capabilities: [frontend-implementation]
      tags: [react, tailwind, typescript]
    reviewer:
      capabilities: [code-review, security-review]
      tags: [security, review]
```

**Field reference:**
| Field | Purpose | Example |
|-------|---------|----------|
| `capabilities` | Routing labels — what this role can do | `[code-generation]` |
| `tags` | Fuzzy keyword matching for SmartRouter | `[node.js, express]` |
| `skillGuidelines` | Behavioral instructions injected into task messages | `["Apply skill karpathy-clean-code: ..."]` |

### `.env`

```bash
PIPAL_API_KEY=your-secret-key
```

## Agent Roles

| Role | Capabilities | When to delegate |
|------|-------------|-----------------|
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

## Skill Guidelines

Every role can define `skillGuidelines` — behavioral instructions that get injected into the task message when that role receives delegated work.

**How it works:**
1. Role defines `skillGuidelines` in `.pipal-a2a/team.yaml`
2. When a task arrives, the extension loads the role's guidelines (before `chdir` to worktree)
3. Guidelines are appended to the task message as a bullet list
4. The agent's pi instance already has all SKILL.md files loaded in context — guidelines trigger the right skill

**Pattern:** Each guideline uses two signals:
- `Apply skill <name>: <essence>` — activates the skill
- `Check skill: <name> for full details` — explicit pointer to the loaded SKILL.md

**Five-skill pipeline:**
| Skill | Trigger | Used by |
|-------|---------|----------|
| karpathy-clean-code | Build | All agents |
| debug-mantra | Debug | backend, frontend, planner |
| scrutinize | Review | reviewer, security, planner |
| post-mortem | Document | planner |
| management-talk | Communicate | planner |

**Terminology:**
| Term | Meaning |
|------|---------|
| `capabilities` | Routing labels — "what I can do" (used by SmartRouter) |
| `tags` | Fuzzy keywords — "match my task text" (used by SmartRouter) |
| `skillGuidelines` | Behavioral triggers — "how I think" (injected into task message) |
| SKILL.md | Full skill definitions — loaded by pi at startup (separate system) |

## Tests

```bash
npm test        # 206 tests, 19 files
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
│   ├── skill-matcher.ts       # Simple skill-based matching
│   └── isolation/             # Agent isolation strategies
│       ├── isolation.ts       # IsolationStrategy interface
│       ├── no-isolation.ts    # Default — agents share cwd
│       └── worktree-isolation.ts  # Git worktree per agent
├── extension/
│   ├── index.ts               # Pi extension entry point (tools + lifecycle)
│   ├── response-capture.ts    # LLM response state machine
│   └── response-transformer.ts # Structured response normalization
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

## Agent Isolation (worktree)

Prevent file conflicts when multiple agents edit the same project. Each agent gets its own git worktree on a dedicated branch.

```yaml
# config/pipal-a2a.yaml
isolation: worktree  # default: none (agents share cwd)
```

**How it works:**
```
prepare()  → git worktree add .pipal-a2a/worktrees/<agent> -b agent/<agent>
finalize() → git add -A && git commit (in the worktree)
cleanup()  → git worktree remove (on disconnect)
```

**Workflow:**
```
1. pi starts → isolation.prepare(agentName) creates worktree
2. Agent edits files in isolated directory
3. Task completes → isolation.finalize() commits changes
4. Agent disconnects → isolation.cleanup() removes worktree
5. Planner calls pipal_a2a_merge({ branch: 'agent/backend' }) to integrate
```

**Available strategies:**
| Strategy | Config value | Description |
|----------|-------------|-------------|
| NoIsolation | `none` (default) | Agents share cwd — zero overhead, current behavior |
| WorktreeIsolation | `worktree` | Git worktree per agent — prevents file conflicts |

**Security:** Shell injection and path traversal blocked via `validateName()` (alphanumeric only) + `execFile()` (no shell).

**Crash recovery:** Orphan worktrees pruned on startup via `cleanupStale()`. Finalize errors preserve worktree (no silent data loss).

## Structured Responses

Agents return consistent, scannable responses. Configurable via `responseFormat`.

```yaml
# config/pipal-a2a.yaml
responseFormat: structured  # default: raw
```

**Structured response format:**
```markdown
## Result
✅ Created user API endpoint with validation

## Changes
- `src/routes/user.ts` (created)
- `src/models/user.ts` (modified)

## Notes
Added input validation for email and password fields.
```

Works via prompt convention + transformer normalization. Zero overhead.

## License

MIT
