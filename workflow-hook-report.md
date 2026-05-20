# Workflow PreHook Implementation Report

## Summary

Implemented a **Workflow PreHook** for `pipal-a2a` that intercepts delegation requests and automatically executes multi-step workflows from `config/team.yaml` when a task matches a workflow name.

---

## What Changed

### 1. `config/team.yaml`

Added `workflows` block alongside existing `team.roles` — per karpathy-clean-code: config activates, does not define.

**New roles added:** `data`, `security`, `reviewer` (used by `btc-trading` workflow steps).

**New section:**

```yaml
workflows:
  btc-trading:
    name: "BTC Trading System"
    description: "Full trading system with backend, security, frontend"
    steps:
      - role: backend
        task: "Build exchange API adapter"
      - role: security
        task: "Audit trading algorithm for vulnerabilities"
        depends_on: [backend]
      - role: data
        task: "Integrate market data feed"
        depends_on: [backend]
      - role: frontend
        task: "Build trading UI with charts"
        depends_on: [backend, data]
      - role: reviewer
        task: "Final code review before production"
        depends_on: [frontend]

  todo-app:
    name: "Todo App"
    description: "Simple todo app with backend API and frontend UI"
    steps:
      - role: backend
        task: "Build REST API for todo operations"
      - role: frontend
        task: "Build todo UI"
        depends_on: [backend]
```

---

### 2. `src/extension/index.ts`

#### Before

No workflow loading, no PreHook logic, no workflow-aware delegation.

#### After

**3 new types added (before `TeamRole`):**

```typescript
interface WorkflowStep {
  role: string;
  task: string;
  depends_on?: string[];
}

interface Workflow {
  name: string;
  description: string;
  steps: WorkflowStep[];
}
```

**`loadWorkflows()` function** — reads workflows from same YAML path resolution as `loadTeamRoles()`:

```typescript
function loadWorkflows(): Map<string, Workflow> {
  const workflows = new Map<string, Workflow>();
  const paths = [
    resolve(process.cwd(), "config/team.yaml"),
    resolve(process.cwd(), "team.yaml"),
    resolve(process.env.HOME || "~", ".pi/config/team.yaml"),
  ];
  for (const p of paths) {
    try {
      const content = readFileSync(p, "utf8");
      const data = load(content, { schema: DEFAULT_SCHEMA }) as any;
      if (data?.workflows) {
        for (const [key, wf] of Object.entries(data.workflows)) {
          const w = wf as any;
          workflows.set(key, {
            name: w.name || key,
            description: w.description || "",
            steps: (w.steps || []).map((s: any) => ({
              role: s.role,
              task: s.task,
              depends_on: s.depends_on || [],
            })),
          });
        }
      }
      break;
    } catch { continue; }
  }
  return workflows;
}
```

**`executeWorkflowIfMatch()` function** — the PreHook:

```typescript
async function executeWorkflowIfMatch(
  task: string, client, card, onlineAgents, signal, onUpdate
): Promise<{ executed: boolean; summary?: string }>
```

- Normalizes task (lowercase, strips `build/run/execute/start/create/make` prefixes)
- Matches against workflow keys (with hyphen↔space normalization)
- Executes steps in order, respecting `depends_on`
- Streams results via `onUpdate` as each step completes
- Returns `{ executed: true }` if workflow ran, `{ executed: false }` otherwise

**`waitForTaskCompletion()` helper** — subscribes to task SSE, streams chunks, handles abort signal.

**Tool description updated:**

```typescript
description:
  "Send a task to another agent terminal in the P2P agent network. " +
  "If the task matches a workflow name in config/team.yaml, " +
  "the entire workflow will be executed automatically. " +
  // ... rest unchanged
```

**Hook point in `execute()`:**

```typescript
// ── Workflow PreHook: intercept if task matches a workflow name ──
if (!params.to && !params.skill) {
  const { executed, summary } = await executeWorkflowIfMatch(
    params.task, client, card!, others, signal, onUpdate,
  );
  if (executed) {
    return {
      content: [{ type: "text" as const, text: summary || "Workflow completed successfully." }],
      details: { workflow: true },
    };
  }
}
// ── End Workflow PreHook — fall through to normal delegation ──
```

---

## How Workflow Matching Works

1. **Trigger condition:** `!params.to && !params.skill` — only for auto-routed tasks (no explicit target or skill). Explicit routing (`to=` or `skill=`) always bypasses the PreHook.

2. **Normalization:** Task text is lowercased, trimmed, and stripped of common verbs (`build`, `run`, `execute`, `start`, `create`, `make`).

3. **Matching:** Workflow key is normalized (hyphens→spaces, lowercase). Match succeeds if task contains key OR key contains task.

4. **Execution:** If matched, iterate steps in order:
   - Check `depends_on` — skip step if dependencies not yet completed
   - Find online agent by role name
   - Delegate task, wait for completion (with 120s timeout)
   - Stream results, accumulate summary
   - Return summary to the caller

5. **Fallback:** If no workflow matches, fall through to normal delegation (SmartRouter or first available agent).

---

## Backward Compatibility

- ✅ Explicit `to=` or `skill=` params bypass PreHook entirely — normal delegation unchanged
- ✅ No workflow in config → `loadWorkflows()` returns empty map → PreHook returns `{ executed: false }` → normal delegation proceeds
- ✅ No `src/core/` files modified
- ✅ All 98 existing tests pass

---

## Test Results

```
Test Files  9 passed (9)
     Tests  98 passed (98)
  Duration  7.56s
```

---

## Files Changed

| File | Change |
|------|--------|
| `config/team.yaml` | Added `workflows:` block, 3 new roles |
| `src/extension/index.ts` | Added `WorkflowStep`/`Workflow` types, `loadWorkflows()`, `executeWorkflowIfMatch()`, `waitForTaskCompletion()`, PreHook in `execute()`, updated tool description |