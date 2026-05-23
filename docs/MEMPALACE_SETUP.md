# MemPalace Setup Guide

**Optional** — agent memory and shared knowledge graph. Disabled by default.

Per karpathy-clean-code: Config activates, not defines. Core doesn't know about MemPalace unless you enable it.

---

## Architecture: Option D — LLM-Driven via promptGuidelines

MemPalace is integrated purely through **prompt guidelines** injected into the planner's delegate tool. There is NO extension code that calls MemPalace — the LLM orchestrates all reads/writes.

```
Planner terminal (LLM)
┌──────────────────────────────────────────────┐
│  delegate tool → promptGuidelines include:    │
│    "BEFORE: call mempalace_search(...)"        │
│    "AFTER: call mempalace_add_drawer(...)"     │
│                                                │
│  The LLM sees these and calls MCP tools        │
│  No pipal-a2a code calls MemPalace directly    │
└──────────────────────────────────────────────┘
```

**Why this approach:**
- Zero coupling — pipal-a2a code never imports MemPalace
- LLM decides when/if to call (smarter than hardcoded hooks)
- If MemPalace is offline → LLM reports failure to user
- Config activates (enable/disable) not defines (no code paths)

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
npm install -g mempalace-mcp

# Start MemPalace MCP
mempalace-mcp --palace ~/.mempalace/palace

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

## Prompt Guidelines (what the planner sees)

When MemPalace is enabled, the delegate tool injects these guidelines:

### Before Delegation (2 calls)
```
[MemPalace] BEFORE delegating: call mempalace_search({ query: <project>, wing: "<wing>", room: "shared" }) to check for prior work.
[MemPalace] BEFORE delegating: call mempalace_kg_query({ entity: <project> }) to find known facts about the project.
```

### After Delegation (3 calls)
```
[MemPalace] AFTER delegation completes: call mempalace_add_drawer({ wing: "<wing>", room: "shared", content: <status> }) to update shared/project-status.
[MemPalace] AFTER delegation completes: call mempalace_kg_add({ subject: <project>, predicate: "has_<role>", object: "completed" }) to record completion.
[MemPalace] AFTER delegation completes: call mempalace_diary_write({ agent_name: "planner", entry: "PROJ:<project>|TASK:<task>|AGENT:<role>|★★★★", wing: "<wing>" }) to log the decision.
```

**Total: 5 MCP calls per delegation** (2 before + 3 after).

## What Gets Stored

| Drawer | Who writes | What |
|--------|-----------|------|
| `project-status` | Planner (via LLM) | Delegation results and status |
| `roadmap` | Planner (via LLM) | Planning docs |
| `decisions` | Planner (via LLM) | Key decisions (append only) |
| `ownership-map` | Planner (via LLM) | Who owns what |
| `diary` | Planner (via LLM) | Timestamped entries |

**Important:** Write ONLY to `shared/` room. Per-agent rooms are scratch only.

## Config Options

| Option | Default | Description |
|--------|---------|-------------|
| `enabled` | `false` | Enable/disable MemPalace integration |
| `wing` | `"wing_pipal_a2a"` | Wing name for your project |
| `sharedRoom` | `"shared"` | Room for cross-agent docs |

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
#   wing: "wing_pipal_a2a"
```

Or set `enabled: false`. No guidelines injected, no MCP calls expected, no MemPalace dependency.

## Troubleshooting

| Issue | Fix |
|-------|-----|
| LLM doesn't call MemPalace | Check `mempalace.enabled: true` in config |
| MemPalace MCP not found | Run `npm install -g mempalace-mcp` |
| Wing/room not found | MemPalace auto-creates wings and rooms on first write |
| LLM calls wrong tools | Check prompt guidelines in delegate tool output |
| MemPalace timeout | LLM will report `MEMPALACE FAILED` — check MCP server is running |
