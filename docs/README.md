# PiPal-A2A Documentation

## Guides

| Guide | Description |
|-------|-------------|
| [Quick Start](./QUICK_START.md) | Get running in 5 minutes |
| [Workflow Setup](./WORKFLOW_SETUP.md) | Define multi-step workflows |
| [MemPalace Test Plan](./MEMPALACE_TEST_PLAN.md) | Optional agent memory testing |

## Key Files

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview and features |
| [ROADMAP.md](../ROADMAP.md) | Planned features and versions |
| [STATUS.md](../STATUS.md) | Current status and test results |
| [config/pipal-a2a.yaml](../config/pipal-a2a.yaml) | Main configuration |
| [config/team.yaml](../config/team.yaml) | Agent roles and workflows |

## Architecture

```
src/
├── core/types.ts           ← Google A2A v1.0 data model (FROZEN)
├── sdk/index.ts            ← AgentRegistry, TaskRouter
├── builtin/
│   ├── skill-matcher.ts    ← Skill-based routing
│   └── smart-router.ts     ← Tag-based auto-routing
├── infrastructure/
│   └── shared-state.ts     ← SharedStateServer + Client + SSE
├── extension/
│   └── index.ts            ← Main extension
└── cli/index.ts            ← CLI entry point
```

## Tests

```bash
npm test    # 145 tests covering core, infrastructure, extension, routing
```
