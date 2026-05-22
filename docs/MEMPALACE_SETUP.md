# MemPalace Setup Guide

**Optional** — agent memory and shared knowledge graph. Disabled by default.

Per karpathy-clean-code: Config activates, not defines. Core doesn't know about MemPalace unless you enable it.

---

## Enable MemPalace

```yaml
# config/pipal-a2a.yaml
mempalace:
  enabled: true
  wing: "wing_my_project"   # your project wing name
  sharedRoom: "shared"
```

## Prerequisites

```bash
# Install MemPalace MCP server
pip install mempalace

# Initialize a palace
mempalace init --palace ~/.mempalace/palace

# Add to pi's MCP config (~/.pi/agent/mcp.json)
{
  "mcpServers": {
    "mempalace": {
      "command": "mempalace-mcp",
      "args": ["--palace", "~/.mempalace/palace"]
    }
  }
}
```

## Default Structure (when enabled)

```
wing_my_project/
├── shared/              ← ONLY for cross-agent docs
│   ├── project-status   ← WHO DID WHAT (agent writes own section)
│   ├── roadmap          ← PLANNER's planning docs
│   ├── decisions        ← KEY DECISIONS LOG (append only)
│   └── ownership-map    ← WHO OWNS WHAT (planner manages)
├── {agent}/             ← SCRATCH ONLY (private notes)
│   └── scratch          ← private ad-hoc
└── diary/               ← ALL agents write (timestamped)
```

## How It Works

Planner sees `promptGuidelines` in the delegate tool — these remind the planner to call MemPalace before/after delegation. Agents never see MemPalace reminders.

### Before Delegation
Planner searches MemPalace for prior work:
```
mempalace_search({ query: "todo-app", wing: "wing_my_project", room: "shared" })
mempalace_kg_query({ entity: "todo-app" })
```

### After Delegation
Planner calls 3 tools to record completion:
```
mempalace_add_drawer({ wing: "wing_my_project", room: "shared", content: "..." })
mempalace_kg_add({ subject: "todo-app", predicate: "has_backend", object: "completed" })
mempalace_diary_write({ agent_name: "planner", entry: "PROJ:todo-app|TASK:...|AGENT:backend|★★★★", wing: "wing_my_project" })
```

## Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable/disable MemPalace integration |
| `wing` | `"wing_a2a"` | Wing name for your project |
| `sharedRoom` | `"shared"` | Room for cross-agent docs |

## What Gets Stored

| Drawer | Who writes | What |
|--------|-----------|------|
| `project-status` | Each agent | Own section only |
| `roadmap` | Planner | Planning docs |
| `decisions` | All agents | Append-only decisions |
| `ownership-map` | Planner | Who owns what |
| `diary` | All agents | Timestamped entries |

## Custom Wing Per Project

Each project gets its own wing:

```yaml
# Project A
mempalace:
  wing: "wing_todo_app"

# Project B  
mempalace:
  wing: "wing_data_pipeline"
```

Wings are isolated — Project A agents don't see Project B's data.

## Disable MemPalace

Remove or comment out the section:

```yaml
# mempalace:
#   enabled: true
#   wing: "wing_a2a"
```

Or set `enabled: false`. No reminders, no tool calls, no MemPalace dependency.
