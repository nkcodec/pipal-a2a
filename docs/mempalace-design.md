# MemPalace Integration Design — v3.1 (Final)

## Architecture

```
wing_{project}/                    ← Wing = project (hard isolation)
├── backend/                       ← room = agent role (auto from team.yaml)
├── frontend/
├── security/
├── data/
├── reviewer/
├── planner/
└── shared/                        ← cross-agent documents

+ Knowledge Graph (shared across ALL wings)
+ Diary (per-agent temporal log, built-in AAAK format)

Examples:
  wing_btc_trading/
  ├── backend/
  ├── frontend/
  └── shared/

  wing_todo_app/
  ├── backend/
  ├── frontend/
  └── shared/
```

### Why Wing = Project (changed from v2)

v2 used `wing_a2a` for all projects. This gave **soft isolation** — search could cross-pollinate between btc-trading and todo-app because both had "Express API" in the `backend/` room.

v3 uses `wing_{project}` per project. This gives **hard isolation** — MemPalace's `search` API filters by wing natively. btc-trading searches NEVER return todo-app results.

```
v2: search("btc-trading", room="backend")  → soft, semantic matching
v3: search("btc-trading", room="backend", wing="wing_btc_trading")  → hard, exact filter
```

---

## Design Principles

1. **Wing = project** — hard isolation between projects
2. **Room = agent role** — auto-created from team.yaml, noise-free
3. **Shared room** — cross-agent documents per project
4. **One drawer per agent per project** — merged each session, not replaced
5. **KG for cross-agent facts** — structured, queryable, global
6. **Diary for temporal log** — per-session, AAAK format
7. **Zero decisions per write** — wing=project, room=role, drawer=auto
8. **Best-effort hooks** — never block agent execution, failures logged only

---

## MCP Client Access (Gate-Blocker #1 — Resolved)

### How hooks call MemPalace

pi has a built-in MCP adapter via the extension system. The extension already has access to MCP tools through `pi.mcp` or the extension context.

```typescript
// In extension context, MCP tools are available via:
const mcp = context.mcp; // pi provides this

// Call mempalace tools:
await mcp.call("mempalace_mempalace_search", { query: projectName, wing, room });
await mcp.call("mempalace_mempalace_add_drawer", { wing, room, content });
await mcp.call("mempalace_mempalace_kg_query", { entity: projectName });
await mcp.call("mempalace_mempalace_kg_add", { subject, predicate, object });
await mcp.call("mempalace_mempalace_diary_write", { entry });
```

### Fallback if MCP not available

> ⚠️ **ASPIRATIONAL** — This fallback path is placeholder pseudocode.
> MCP servers use JSON-RPC over stdio/SSE, not REST over HTTP.
> This will NOT work against a real MCP server as-is.
> If pi's MCP context is unavailable, hooks log a warning and proceed without MemPalace.
> Remove this fallback if pi always provides MCP context.

```typescript
// PLACEHOLDER — not functional against real MCP servers
// MCP uses stdio/SSE JSON-RPC, not REST HTTP
// If needed, implement proper MCP JSON-RPC client here
const MEMPALACE_URL = process.env.MEMPALACE_URL || "";
```

---

## Hook Mapping

Every hook input maps 1:1 to a MemPalace parameter. Zero ambiguity.

```
Hook Input              →  MemPalace Param
───────────────────────────────────────────
projectName             →  wing name (wing_btc_trading)
step.role               →  room name (backend, frontend, etc.)
projectName             →  search query (scoped to wing)
result text             →  drawer content
```

---

## Project Resolution Strategy

Not all tasks come from workflows. Ad-hoc delegations need project context too.

```
Priority:
  1. matchedWorkflow.name           → "btc-trading" (workflow match)
  2. process.cwd() basename         → current directory name
  3. "scratch"                      → fallback for unresolvable projects
```

Wing name derived from project:

```typescript
function resolveWingName(projectName: string): string {
  return `wing_${projectName.replace(/-/g, "_")}`;
}
// "btc-trading" → "wing_btc_trading"
// "todo-app" → "wing_todo_app"
```

---

## Hook Lifecycle Integration Points (Gate-Blocker #2 — Resolved)

### Where hooks fire in the existing code

```
Current code flow (src/extension/index.ts):

  delegateHandler()                    ← User calls pipal_a2a_delegate
    → executeWorkflowIfMatch()         ← PreHook: workflow matching
        → for each step:
            → createTask()             ← TASK STARTS
            → waitForTaskCompletion()  ← TASK ENDS
    → return results

MemPalace hooks integrate at exact points:

  delegateHandler()
    → executeWorkflowIfMatch()
        → mempalacePreHook(project, role)    ← NEW: before createTask
        → createTask()
        → waitForTaskCompletion()
        → mempalacePostHook(project, role, result)  ← NEW: after completion
    → return results

  For NON-workflow delegations:
  delegateHandler()
    → mempalacePreHook(project, role)    ← NEW: before normal delegation
    → normal delegation
    → mempalacePostHook(project, role, result)  ← NEW: after result
```

### Code integration points

```typescript
// In executeWorkflowIfMatch(), before delegating each step:
await mempalacePreHook(step.role, projectName, enrichedTask);

// After waitForTaskCompletion():
await mempalacePostHook(step.role, projectName, result);

// In normal delegation path (non-workflow):
await mempalacePreHook(config.role, projectName, task);
// ... delegation happens ...
await mempalacePostHook(config.role, projectName, result);
```

---

## PreHook Flow (before agent works)

```
Agent receives: "Build trading API in btc-trading/"

PreHook runs (2 calls, parallel, best-effort):

  1. kg_query(projectName)
     → "has_backend: false"     → Not built yet, OK to proceed
     → "built_by: null"         → No conflicts with other agents

  2. search(projectName, wing=resolveWingName(project), room=agentRole)
     → Hard-filtered to project wing + agent room
     → Zero cross-project contamination
     → Returns only relevant context

If MemPalace is DOWN:
  → Log warning, agent proceeds without context
```

## PostHook Flow (after agent finishes)

```
Agent completed: Built Express API with 4 routes, 8 files

PostHook runs (4 calls, allSettled, best-effort):

  1. search(projectName, wing, room=agentRole)
     → Find existing drawer for this project+agent
     → If found: mergeDrawerContent(old, new) → update_drawer(merged)
     → If not found: add_drawer(new)
     → This is a read-before-write: 1 search + 1 write = 2 calls
     → Client-side merge (not server-side) — we control the merge logic

  2. queryThenInvalidate(projectName, predicate, newObject)
     → kg_query to find old value
     → kg_invalidate old value
     → kg_add new value
     → Wrapped in helper, not exposed as 3 separate calls

  3. diary_write("PROJ:btc-trading|TASK:Build API|FILES:8|★★★★")
     → Includes task text for temporal search

  4. (optional) If cross-agent document detected:
     → add_drawer(wing, room="shared", document)
     → Ownership check via sharedWriteOwnership map

If MemPalace is DOWN:
  → Log warning, caller still gets result

MERGE STRATEGY DECISION: Client-side merge.
  - search existing → merge in code → update_drawer with merged content.
  - NOT relying on add_drawer's built-in dedup (it replaces, doesn't merge).
  - This gives us full control over the History section preservation.
  - Cost: 1 extra search call per PostHook (6 total calls instead of 5).
```

---

## Resilience (Fixed)

All MemPalace calls are **best-effort**. Never block agent execution.

```typescript
async function postHook(result, agentRole, projectName) {
  // Promise.allSettled — partial success is OK
  const results = await Promise.allSettled([
    storeOrUpdateDrawer(agentRole, projectName, result),
    queryThenInvalidateKG(projectName, result),
    diaryWrite(projectName, result),
  ]);

  // Log any failures, but never throw
  results.forEach((r, i) => {
    if (r.status === 'rejected') {
      const names = ['drawer', 'kg', 'diary'];
      console.warn(`[pipal-a2a] ⚠️ ${names[i]} store failed: ${r.reason}`);
    }
  });
}
```

**Key fix:** `Promise.allSettled` instead of `Promise.all`. If diary fails, drawer and KG still succeed.

---

## KG Helper (Fixed)

```typescript
async function queryThenInvalidateKG(
  subject: string,
  predicate: string,
  newObject: string
): Promise<void> {
  // 1. Query current value
  const current = await mcpCall("kg_query", { entity: subject });
  const facts = current?.facts || [];

  // 2. Invalidate matching predicate
  const match = facts.find((f: any) => f.predicate === predicate);
  if (match) {
    await mcpCall("kg_invalidate", {
      subject,
      predicate,
      object: match.object
    });
  }

  // 3. Add new value
  await mcpCall("kg_add", { subject, predicate, object: newObject });
}
```

---

## Shared Room Write Ownership (Fixed)

```typescript
// mempalace-types.ts
const sharedWriteOwnership: Record<string, string> = {
  "api-spec": "backend",
  "db-schema": "backend",
  "project-spec": "planner",
  "security-checklist": "security",
  "env-schema": "backend",
  "data-schema": "data",
};

async function writeToShared(
  agentRole: string,
  docType: string,
  wing: string,
  content: string
): Promise<void> {
  const owner = sharedWriteOwnership[docType];
  if (owner && owner !== agentRole) {
    console.warn(`[pipal-a2a] ⚠️ ${agentRole} cannot write ${docType} (owned by ${owner})`);
    return;
  }
  await mcpCall("add_drawer", { wing, room: "shared", content });
}
```

---

## Drawer Format

One drawer per project per agent. Content merged via client-side read-before-write.

```markdown
# {project_name}

## What I Built
{files, endpoints, components}

## Decisions
{why I chose X over Y}

## Issues & Fixes
{bugs hit, how fixed}

## Tips for Next Time
{what worked, what didn't}

## Dependencies
{what this project needs}

## How to Run
{exact commands}

## History
- {date}: {session summary}

## Updated: {date}
```

Merge logic:

```typescript
function mergeDrawerContent(existing: string, newContent: string): string {
  // Extract History section from existing
  const history = extractSection(existing, "History");

  // Use new content for all sections (more recent = more accurate)
  // Append previous "What I Built" + "Decisions" as new history entry
  const prevSummary = extractSections(existing, ["What I Built", "Decisions"]);
  const prevDate = extractDate(existing);

  const merged = newContent.replace(
    "## History",
    `## History\n- ${prevDate}: ${prevSummary}\n${history}`
  );

  return merged;
}
```

---

## Auto Room & Wing Creation

Wings and rooms are NOT hardcoded. Created on-demand.

```typescript
// MemPalace auto-creates wings/rooms on first add_drawer call
// No explicit creation needed — just write to it
// First add_drawer("wing_btc_trading", "backend", ...) creates both
```

---

## Efficiency

| Metric | Value |
|--------|-------|
| PreHook calls | 2 (parallel) |
| PostHook calls | 4 (allSettled: search+merge, kg, diary, shared?) |
| Total per task | 6 calls |
| Latency added | <500ms (LLM takes 30-60s) |
| Agent decisions | 0 (wing=project, room=role) |
| Blocking on failure | Never — allSettled + try/catch |

---

## File Structure

```
src/extension/
├── index.ts                 ← existing hooks (minimal changes)
├── mempalace-types.ts       ← SDK: types, interfaces, ownership map, merge logic
├── mempalace-hooks.ts       ← Implementation: PreHook/PostHook, resilience
└── mempalace.ts             ← Wiring: MCP client, lifecycle integration

config/pipal-a2a.yaml:
  mempalace:
    enabled: true
    wing_prefix: "wing_"     ← prefix for wing names
    autoQuery: true
    autoStore: true
```

---

## Test Plan

Three layers per karpathy-clean-code:

```
tests/
├── mempalace-types.test.ts   ← Core: project resolution, wing naming,
│                               drawer merge, shared ownership (pure functions)
├── mempalace-hooks.test.ts   ← Hook: PreHook/PostHook with stubs
│                               (stub mcpCall, verify correct calls made)
└── mempalace-e2e.test.ts     ← E2E: real MCP calls (optional, CI skip)
                                (real MemPalace, verify integration)
```

---

## v2 → v3 Migration

**Wing changed from `wing_a2a` (all projects) to `wing_{project}` (per project).**

- Existing `wing_a2a` data remains readable but is orphaned (no new writes)
- To migrate: re-create drawers under new `wing_{project}` wings
- Or: leave old data, new workflows write to new wings automatically
- No data loss — old wings still searchable manually

---

## Evolution Rules

```
v0.3.1:  Wing=project, room=agent, shared room, KG, diary
  ↓
  (when >10 projects, wing proliferation)
  ↓
v0.3.2:  Add wing listing/management, archive old project wings
  ↓
  (when shared/ gets >50 documents)
  ↓
v0.3.3:  Split shared into typed sub-drawers
```

---

## Summary

```
Wing = project          →  Hard isolation between projects (changed from v2)
Room = agent role       →  No noise, auto-created from team.yaml
Shared room             →  Cross-agent docs with write ownership
One drawer/agent/project → Merged, never replaced
KG + queryThenInvalidate → Structured facts, no pollution
Diary per task          →  Temporal audit trail with task text
Best-effort allSettled  →  Partial success OK, never block
MCP via pi context      →  Native MCP access with HTTP fallback
Project fallback        →  workflow.name → cwd → "scratch"
6 calls total           →  <500ms overhead
Zero decisions          →  wing=project, room=role, drawer=auto
```
