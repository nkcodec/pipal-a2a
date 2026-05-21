# MemPalace Integration Design — Final v2

## Architecture

```
wing_a2a/
├── backend/     ← auto-created from team.yaml roles
├── frontend/    ← auto-created from team.yaml roles
├── security/    ← auto-created from team.yaml roles
├── data/        ← auto-created from team.yaml roles
├── reviewer/    ← auto-created from team.yaml roles
├── planner/     ← auto-created from team.yaml roles
└── shared/      ← cross-agent documents (API specs, schemas, specs)

+ Knowledge Graph (shared, structured facts across agents)
+ Diary (per-agent temporal log, built-in AAAK format)
```

## Design Principles

1. **Per-agent rooms** — auto-created from team.yaml, not hardcoded
2. **Shared room** — cross-agent documents that don't fit in KG triples
3. **One drawer per project per agent** — merged each session, not replaced
4. **KG for cross-agent facts** — structured, queryable, shared
5. **Diary for temporal log** — per-session, AAAK format
6. **Zero decisions per write** — room=role, drawer=project, content=result
7. **Best-effort hooks** — never block agent execution, failures logged only

---

## Hook Mapping

Every hook input maps 1:1 to a MemPalace parameter. Zero ambiguity.

```
Hook Input              →  MemPalace Param
───────────────────────────────────────────
step.role               →  room name (from team.yaml)
matchedWorkflow.name    →  drawer lookup (btc-trading, todo-app)
process.cwd() basename  →  drawer lookup FALLBACK for ad-hoc tasks
step.task               →  search query (project name added to scope)
result text             →  drawer content
```

---

## Project Resolution Strategy

Not all tasks come from workflows. Ad-hoc delegations need project context too.

```
Priority:
  1. matchedWorkflow.name        → "btc-trading" (workflow match)
  2. process.cwd() basename      → "pipal-a2a" (current directory)
  3. "scratch"                   → fallback for unresolvable projects
```

In code:

```typescript
function resolveProjectName(task: string, workflow?: Workflow): string {
  if (workflow?.name) return workflow.name;           // Workflow match
  const cwd = path.basename(process.cwd());           // Current directory
  if (cwd !== 'pipal-a2a' && cwd !== 'src') return cwd; // In project dir
  return 'scratch';                                   // Fallback
}
```

---

## PreHook Flow (before agent works)

```
Agent receives: "Build trading API in btc-trading/"

PreHook runs (2 calls, parallel, best-effort):

  1. kg_query(projectName)
     → "has_backend: false"     → Not built yet, OK to proceed
     → "built_by: null"         → No conflicts with other agents

  2. search(projectName, room=agentRole)
     → Scoped to own room + project name in query
     → Prevents cross-project contamination
     → Returns only relevant context

If MemPalace is DOWN:
  → Log warning: "[pipal-a2a] ⚠️ MemPalace unavailable, skipping context"
  → Agent proceeds without context (no blocking)
```

## PostHook Flow (after agent finishes)

```
Agent completed: Built Express API with 4 routes, 8 files

PostHook runs (4 calls, best-effort):

  1. check_duplicate(projectName, room=agentRole)
     → If exists: update_drawer(merge new content with existing)
     → If not: add_drawer(new project knowledge)
     → MERGE, not replace — preserves session 1 history

  2. kg_invalidate(old facts) → kg_add(new facts)
     → Invalidate stale facts before adding new ones
     → Prevents KG pollution

  3. diary_write("PROJ:btc-trading|TASK:Build API|FILES:8|★★★★")
     → Includes task text for temporal search

  4. If document is cross-agent (API spec, schema):
     → add_drawer("wing_a2a", "shared", document)
     → Goes to shared room, not agent's private room

If MemPalace is DOWN:
  → Log warning: "[pipal-a2a] ⚠️ MemPalace unavailable, results not stored"
  → Agent result still returns to caller (no data loss for caller)
```

---

## Drawer Format

One drawer per project per agent. **Merged** each session (not replaced).

```markdown
# {project_name}

## What I Built
{files, endpoints, components — concrete deliverables}

## Decisions
{why I chose X over Y — only non-obvious ones}

## Issues & Fixes
{bugs hit, how fixed — prevents repeat mistakes}

## Tips for Next Time
{what worked, what didn't}

## Dependencies
{what this project needs to run}

## How to Run
{exact commands}

## History
- {date}: {session summary} (merged from previous sessions)

## Updated: {date}
```

Merge strategy:

```typescript
function mergeDrawerContent(existing: string, newContent: string): string {
  // Keep existing "History" section, append current session
  // Replace other sections with new content (more recent = more accurate)
  // Never delete history — only append
}
```

---

## Shared Room

Cross-agent documents that don't fit in KG triples.

```
wing_a2a/shared/
├── drawer: "btc-trading-api-spec"     ← OpenAPI spec (backend writes, frontend reads)
├── drawer: "btc-trading-env-schema"   ← .env variables
├── drawer: "btc-trading-db-schema"    ← Database schema
└── drawer: "btc-trading-project-spec" ← Full project spec (planner writes)
```

Who writes to shared:

| Document | Written By | Read By |
|----------|-----------|---------|
| API spec / endpoints | backend | frontend, data |
| DB schema | backend | data, security |
| Project spec | planner | all agents |
| Security checklist | security | backend, frontend |
| .env variables | backend | all agents |

---

## Knowledge Graph

Structured facts shared across ALL agents.

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

**Invalidation strategy:**

```typescript
// Before adding new status, invalidate old one
await kg_invalidate("btc-trading", "status", "in-progress");
await kg_add("btc-trading", "status", "complete");
```

---

## Diary

Per-agent temporal log using MemPalace's built-in AAAK format.

```
diary_write("PROJ:btc-trading|TASK:Build trading API|FILES:8|★★★★")
diary_write("PROJ:btc-trading|TASK:Fix cjs extension|TIP:check-parent-pkg|★★★")
diary_write("PROJ:btc-trading|TASK:Audit code|FINDINGS:7|SEV:2-high-5-medium|★★★★")
```

**Session boundary:** One diary entry per PostHook invocation (one per delegated task).

---

## Planner Is Special

Planner coordinates all agents. It searches EVERYWHERE.

```
planner PreHook:
  1. kg_query("btc-trading")              → ALL structured facts
  2. search("btc-trading")                → ALL rooms (no room filter)
  3. search("btc-trading", room="shared") → Cross-agent documents
  4. Check: which agents already worked on this?

planner PostHook:
  1. diary_write(workflow execution log)  → Full workflow result
  2. kg_invalidate(project, "status", old)
  3. kg_add(project, "status", "complete")
  4. add_drawer("wing_a2a", "shared", project_spec) → for other agents
```

---

## Resilience

All MemPalace calls are **best-effort**. Never block agent execution.

```typescript
async function preHook(task, agentRole, projectName) {
  try {
    const [facts, context] = await Promise.all([
      kg_query(projectName),
      search(projectName, { room: agentRole })
    ]);
    return { facts, context };
  } catch (err) {
    console.warn('[pipal-a2a] ⚠️ MemPalace unavailable, skipping context');
    return { facts: null, context: null }; // Agent proceeds without context
  }
}

async function postHook(result, agentRole, projectName) {
  try {
    await Promise.all([
      storeOrUpdateDrawer(agentRole, projectName, result),
      updateKG(projectName, result),
      diary_write(formatDiaryEntry(projectName, result))
    ]);
  } catch (err) {
    console.warn('[pipal-a2a] ⚠️ MemPalace unavailable, results not stored');
    // Caller still gets result — no data loss
  }
}
```

---

## Auto Room Creation

Rooms are NOT hardcoded. They're created on-demand from team.yaml.

```typescript
async function ensureRoomExists(role: string) {
  // add_drawer auto-creates room if it doesn't exist
  // No explicit room creation needed — just write to it
  // First write to "backend" room creates it automatically
}
```

---

## Efficiency

| Metric | Value |
|--------|-------|
| PreHook calls | 2 (parallel) |
| PostHook calls | 3-4 (parallel) |
| Total per task | 5-6 calls |
| Latency added | <500ms (LLM takes 30-60s) |
| Agent decisions | 0 (room=role, drawer=project) |
| Cognitive load | Zero — just write naturally |
| Blocking on failure | Never — best-effort only |

---

## File Structure

```
src/extension/
├── index.ts                 ← existing hooks (unchanged)
├── mempalace-types.ts       ← SDK: types, interfaces, drawer format
├── mempalace-hooks.ts       ← Implementation: PreHook/PostHook logic
└── mempalace.ts             ← Wiring: connects to MCP, registers hooks

config/pipal-a2a.yaml:
  mempalace:
    enabled: true            ← Config activates, not defines
    wing: "wing_a2a"
    autoQuery: true           ← PreHook queries palace
    autoStore: true           ← PostHook stores results
```

---

## Test Plan

Three layers per karpathy-clean-code:

```
tests/
├── mempalace-types.test.ts   ← Core: project resolution, drawer merge logic
│                               (pure functions, no MCP needed)
├── mempalace-hooks.test.ts   ← Hook: PreHook/PostHook with stubs
│                               (stub MCP calls, verify behavior)
└── mempalace-e2e.test.ts     ← E2E: real MCP calls (optional, CI skip)
                                (real MemPalace, verify integration)
```

---

## Evolution Rules

Per karpathy-clean-code: **split when you feel friction, not before.**

```
v0.3.1:  Per-agent rooms + shared + KG + diary
  ↓
  (when shared/ gets >50 documents)
  ↓
v0.3.2:  Split shared into sub-rooms (specs/, schemas/, checklists/)
  ↓
  (when agent room gets >100 drawers)
  ↓
v0.3.3:  Agent naturally categorizes its own room
```

---

## Summary

```
Per-agent rooms       →  No noise, auto-created from team.yaml
Shared room           →  Cross-agent documents (API specs, schemas)
One drawer/project    →  Merged each session, never replaced
KG + invalidation     →  Structured facts, no pollution
Diary per task        →  Temporal audit trail with task text
Best-effort hooks     →  Never block, never lose caller data
Project fallback      →  workflow.name → cwd → "scratch"
5-6 calls total       →  <500ms overhead
Zero decisions        →  room=role, drawer=project
```
