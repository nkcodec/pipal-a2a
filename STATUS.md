# PiPal-A2A Project Status

> Planner's single source of truth. Updated after every session.
> Last updated: 2026-05-21

## Current Version: v0.3.1

```
v0.3.1 ✅  Mempalace integration (agent memory & shared KB) — Option D (LLM-driven)
v0.3.1 ✅  Task clarity guard (reject vague tasks with Wh-questions)
v0.3.0 ✅  Workflow PreHook (automated multi-step workflows)
v0.2.4 ✅  .env file support
v0.2.3 ✅  Role reference pattern (PIPAL_ROLE)
v0.2.2 ✅  Infrastructure reliability (Tier 2)
v0.2.1 ✅  Security hardening (Tier 1)
v0.2.0 ✅  Essential Google A2A v1.0 features
v0.1.4 ✅  Auth (API Key)
```

## Test Status

```
145 tests passing (0 failing)
├── 121 existing tests (core + infrastructure + extension)
└── 24 new tests
    ├── 23 mempalace-core tests (resolveProjectName, mergeDrawerContent, etc.)
    └── task-clarity tests (reject vague tasks, accept clear tasks)
```

## Source Tree (src/)

```
src/
├── core/types.ts           ← FROZEN — Google A2A v1.0 data model
├── sdk/index.ts            ← Stable — AgentRegistry, TaskRouter
├── builtin/
│   ├── skill-matcher.ts    ← Skill-based routing
│   └── smart-router.ts     ← Tag-based auto-routing
├── infrastructure/
│   └── shared-state.ts     ← SharedStateServer + Client + SSE
├── extension/
│   ├── index.ts            ← Main extension (~1100 lines, wired + task-clarity)
│   ├── mempalace-types.ts  ← Core: pure functions, zero MCP
│   ├── mempalace-hooks.ts  ← PreHook/PostHook logic (unused, kept)
│   └── mempalace.ts        ← Wiring: MCP client + config (unused, kept)
└── cli/index.ts            ← CLI entry point
```

## Config Files

```
config/
├── pipal-a2a.yaml    ← Per-terminal identity + mempalace config
└── team.yaml         ← Roles, skills, workflows (single source of truth)
.env                  ← Secrets (gitignored)
```

## Agent Roster (team.yaml)

| Role | Skills | Tags |
|------|--------|------|
| planner | planning, delegation | plan, architecture, design |
| backend | code-generation, backend-implementation | node.js, express, api, backend |
| frontend | frontend-implementation | react, ui, frontend |
| data | data-engineering, simulation | data, simulation, mock |
| security | security-review, penetration-testing | security, review, audit |
| reviewer | code-review | review, testing, quality |

## MemPalace Integration (v0.3.1)

**Architecture:** Option D — LLM-driven MCP calls
**Room Strategy:** shared/ ONLY for cross-agent docs. Per-agent rooms = scratch only.

```
wing_a2a/
├── shared/            ← ONLY for cross-agent docs
│   ├── project-status  ← WHO DID WHAT (agent writes own section)
│   ├── roadmap         ← PLANNER's planning docs
│   ├── decisions       ← KEY DECISIONS LOG (append only, all agents write)
│   └── ownership-map   ← WHO OWNS WHAT (planner manages)
├── {agent}/           ← SCRATCH ONLY (private notes, NOT project docs)
└── diary/             ← ALL agents write (timestamped)
```

**Hook flow (LLM-driven, write to shared/ ONLY):**
```
BEFORE delegate:
  1. mempalace_search({ wing: "wing_a2a", room: "shared" })
  2. mempalace_kg_query({ entity: <project> })

AFTER delegate:
  3. mempalace_add_drawer({ wing: "wing_a2a", room: "shared", content }) → shared/project-status
  4. mempalace_kg_add({ subject, predicate: "has_<role>", object: "completed" })
  5. mempalace_diary_write({ agent_name, entry, wing: "wing_a2a" })
```

**Why shared/ only:**
- No race conditions — agent writes to their SECTION only in project-status
- No confusion — one place to write, one place to read
- Ownership map prevents multi-agent conflicts

**Rooms created:**
- shared/ownership-map ✅
- shared/project-status ✅
- shared/roadmap ✅
- shared/decisions ✅

**Per-agent rooms (planner/, backend/, reviewer/) = SCRATCH only**

## Workflows (team.yaml)

| Workflow | Steps | Tested |
|----------|-------|--------|
| btc-trading | backend → security → data → frontend → reviewer | ✅ E2E |
| todo-app | backend → frontend | ❌ Not tested yet |

## Git Log (recent)

```
90f4444 fix(task-clarity): correct regex patterns + add 'build something cool' test
2b7d5f4 feat: task clarity guard — reject vague tasks with Wh-questions
42fbc05 docs: update STATUS.md — Option D live-tested
53726a5 fix(mempalace): diary_write requires agent_name param
ebcec04 refactor(mempalace): Option D — LLM-driven MCP calls (-73 lines)
```

## Next Steps (Priority Order)

1. **Test todo-app workflow** — `build todo-app` with 2+ agents
2. **Add task-clarity guard tests** — Layer 2 integration test (mock SSE, verify rejection)
3. **Add Mempalace integration test** — verify LLM calls MCP tools before/after delegation
4. **v0.3.2** — Full Google A2A v1.0 spec compliance (= v1.0)
5. **Layer 2+3 tests for mempalace-hooks.ts** — verify call patterns with stubs

## Known Issues

- None currently blocking

## Key Decisions Log

| Date | Decision | Rationale |
|------|----------|-----------|
| 2026-05-19 | PIPAL_ROLE > PIPAL_NAME | team.yaml = single source of truth |
| 2026-05-20 | Workflow PreHook | Multi-step automation without central orchestrator |
| 2026-05-20 | working_dir enforcement | Text instructions ignored; mkdir + prepend works |
| 2026-05-21 | wing = wing_a2a (not per-project) | Cross-project learning is a feature |
| 2026-05-21 | Per-agent rooms | Noise-free isolation |
| 2026-05-21 | Client-side merge | Read-before-write, not server-side |
| 2026-05-21 | Best-effort hooks | Promise.allSettled, never block agent execution |
| 2026-05-21 | Split-based extractSection | Regex failed multiline; split is robust |
