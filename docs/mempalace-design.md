# MemPalace Integration Design — Final

## Architecture

```
wing_a2a/
├── backend/     ← backend agent's room (isolated)
├── frontend/    ← frontend agent's room (isolated)
├── security/    ← security agent's room (isolated)
├── data/        ← data agent's room (isolated)
├── reviewer/    ← reviewer agent's room (isolated)
└── planner/     ← planner agent's room (searches ALL rooms)

+ Knowledge Graph (shared, structured facts across agents)
+ Diary (per-agent temporal log, built-in AAAK format)
```

## Design Principles

1. **Per-agent rooms** — agents only see their own context (no noise)
2. **One drawer per project** — updated each session, not appended
3. **KG for cross-agent facts** — structured, queryable, shared
4. **Diary for temporal log** — per-session, AAAK format
5. **Zero decisions per write** — room=role, drawer=project, content=result

---

## Hook Mapping

Every hook input maps 1:1 to a MemPalace parameter. Zero ambiguity.

```
Hook Input              →  MemPalace Param
───────────────────────────────────────────
step.role               →  room name (backend, frontend, etc.)
matchedWorkflow.name    →  drawer lookup (btc-trading, todo-app)
step.task               →  search query
result text             →  drawer content
```

---

## PreHook Flow (before agent works)

```
Agent receives: "Build trading API in btc-trading/"

PreHook runs (2 calls, parallel):

  1. kg_query("btc-trading")
     → "has_backend: false"     → Not built yet, OK to proceed
     → "built_by: null"         → No conflicts with other agents

  2. search("btc-trading", room="backend")
     → No results               → First time, no prior context
     → OR: finds drawer         → "Already built Express API last session"
     → OR: finds tip            → "Use .cjs when parent has type:module"

Agent now has context before starting.
Inject context into task description.
```

## PostHook Flow (after agent finishes)

```
Agent completed: Built Express API with 4 routes, 8 files

PostHook runs (3 calls, parallel):

  1. add_drawer("wing_a2a", "backend", updated_project_summary)
     → Replaces previous drawer for this project
     → Single source of truth per project per agent

  2. kg_add("btc-trading", "has_backend", "express-api")
     → Structured fact, any agent can query
     → Other agents check this before starting

  3. diary_write("PROJ:btc-trading|built.api|FILES:8|★★★★")
     → Temporal session log
     → Useful for debugging and auditing
```

---

## Drawer Format

One drawer per project per agent. Updated (replaced) each session.

```markdown
# {project_name}

## What I Built
{files, endpoints, components — concrete deliverables}

## Decisions
{why I chose X over Y — only non-obvious ones}

## Issues & Fixes
{bugs hit, how fixed — prevents repeat mistakes}

## Dependencies
{what this project needs to run}

## How to Run
{exact commands}

## Updated: {date}
```

No categories. No templates. Natural language. Agent writes freely.

---

## Knowledge Graph

Structured facts shared across ALL agents. Queried by any agent.

```
kg_add(subject, predicate, object)

# Project facts
btc-trading → has_backend → express-api
btc-trading → has_frontend → react-ui
btc-trading → has_data_feed → sse-simulator
btc-trading → status → complete

# Agent preferences (learned over time)
backend → prefers → specific-task-descriptions
frontend → prefers → detailed-component-specs

# Vulnerability tracking
btc-trading → has_vulnerability → xss-sse-inject (fixed)
btc-trading → has_vulnerability → ssrf-orderbook (open)
```

Query examples:
```
kg_query("btc-trading")
  → All facts about btc-trading project

kg_query("backend")
  → What we know about backend agent's preferences
```

---

## Diary

Per-agent temporal log using MemPalace's built-in AAAK format.

```
diary_write("PROJ:btc-trading|BUILT:express-api|FILES:8|★★★★")
diary_write("PROJ:btc-trading|FIX:cjs-extension|TIP:check-parent-pkg|★★★")
diary_write("PROJ:btc-trading|AUDIT:7-findings|SEV:2-high-5-medium|★★★★")
```

Read at session start:
```
diary_read() → recent entries → what happened last session
```

---

## Planner Is Special

Planner coordinates all agents. It searches EVERYWHERE.

```
planner PreHook:
  1. kg_query("btc-trading")              → ALL structured facts
  2. search("btc-trading")                → ALL rooms (no room filter)
  3. Check: which agents already worked on this?

planner PostHook:
  1. diary_write(workflow execution log)  → Full workflow result
  2. kg_add(project, "workflow_status", "complete")
```

---

## Efficiency

| Metric | Value |
|--------|-------|
| PreHook calls | 2 (parallel) |
| PostHook calls | 3 (parallel) |
| Total per task | 5 calls |
| Latency added | <500ms (LLM takes 30-60s) |
| Agent decisions | 0 (room=role, drawer=project) |
| Cognitive load | Zero — just write naturally |

---

## Evolution Rules

Per karpathy-clean-code: **split when you feel friction, not before.**

```
v0.3.1:  Per-agent rooms (5-6 rooms) + KG + diary
  ↓
  (when drawer gets >50 entries about same topic)
  ↓
v0.3.2:  Agent naturally splits its own room into sub-drawers
  ↓
  (when agents need shared knowledge space)
  ↓
v0.3.3:  Add shared/ room for cross-agent context
```

---

## Configuration

```yaml
# config/pipal-a2a.yaml
mempalace:
  enabled: true          # Config activates, not defines
  wing: "wing_a2a"       # Wing name
  autoQuery: true         # PreHook queries palace
  autoStore: true         # PostHook stores results
```

---

## Implementation Plan

| Step | What | File |
|------|------|------|
| 1 | MemPalace MCP connection | `src/extension/mempalace.ts` |
| 2 | PreHook: query context | `src/extension/mempalace.ts` |
| 3 | PostHook: store results | `src/extension/mempalace.ts` |
| 4 | Config option | `config/pipal-a2a.yaml` |
| 5 | Tests | `tests/mempalace.test.ts` |

---

## Summary

```
Per-agent rooms  →  No noise, fast queries
One drawer/project  →  Updated, not appended
KG for cross-agent  →  Structured shared facts
Diary for temporal  →  Session audit trail
5 API calls total  →  <500ms overhead
Zero decisions     →  room=role, drawer=project
```
