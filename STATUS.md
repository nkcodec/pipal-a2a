# PiPal-A2A Project Status

> Planner's single source of truth. Updated after every session.
> Last updated: 2026-05-21

## Current Version: v0.3.1

```
v0.3.1 ✅  Mempalace integration (agent memory & shared KB)
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
121 tests passing (0 failing)
├── 98 existing tests (core + infrastructure + extension)
└── 23 new mempalace-core tests
    ├── resolveProjectName: 6
    ├── extractSection: 4
    ├── mergeDrawerContent: 2
    ├── canWriteShared: 4
    ├── SHARED_WRITE_OWNERSHIP: 1
    ├── DEFAULT_MEMPALACE_CONFIG: 2
    └── loadMempalaceConfig: 4
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
│   ├── index.ts            ← Main extension (~1150 lines, wired)
│   ├── mempalace-types.ts  ← Core: pure functions, zero MCP
│   ├── mempalace-hooks.ts  ← Implementation: PreHook/PostHook
│   └── mempalace.ts        ← Wiring: MCP client + config
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

**Architecture:**
```
wing_a2a/                        ← ONE wing for agent system
├── {agent_role}/                ← per-agent room (auto from team.yaml)
│   ├── drawer: "project-name"  ← project = just a drawer
│   └── drawer: "scratch"       ← ad-hoc tasks
├── shared/                      ← cross-agent docs (write ownership map)
└── Knowledge Graph (queryThenInvalidate, shared facts)
```

**Hook flow:**
```
PreHook:  2 calls (parallel): kg_query + search own room
PostHook: 4 calls (allSettled): search+merge, kg update, diary, optional shared
Total:    6 calls per task, <500ms overhead, zero decisions per write
```

**Status:** Wired into both workflow + normal delegation paths. Active when MCP server connected. Graceful no-op otherwise.

## Workflows (team.yaml)

| Workflow | Steps | Tested |
|----------|-------|--------|
| btc-trading | backend → security → data → frontend → reviewer | ✅ E2E |
| todo-app | backend → frontend | ❌ Not tested yet |

## Git Log (recent)

```
b4e316d docs: mark v0.3.1 as shipped in roadmap
a698133 config: enable mempalace in pipal-a2a.yaml
1726f6a feat(mempalace): wire PreHook/PostHook into delegation flow
1a0898c feat(mempalace): Core + Hooks + Wiring + Tests
00c8bb8 docs: mempalace design v3.2
```

## Next Steps (Priority Order)

1. **Test todo-app workflow** — `build todo-app` with 2+ agents
2. **Connect MemPalace MCP** — verify hooks fire with real MCP server
3. **Add hook-layer tests** — Layer 2 (stubs, verify PreHook/PostHook call patterns)
4. **v0.3.2** — Full Google A2A v1.0 spec compliance (= v1.0)

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
