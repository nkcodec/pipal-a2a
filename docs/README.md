# PiPal-A2A Documentation

## Guides

| Guide | Description |
|-------|-------------|
| [Quick Start](./QUICK_START.md) | Get running in 5 minutes |
| [Workflow Setup](./WORKFLOW_SETUP.md) | Define multi-step workflows |
| [MemPalace Setup](./MEMPALACE_SETUP.md) | Optional agent memory via MCP |

## Architecture

See [README.md](../README.md#architecture) for:
- Clean architecture layers (core → sdk → application → infrastructure)
- Star topology diagram
- Layer rules (karpathy-clean-code)
- Performance benchmarks

## Key Concepts

| Concept | Description |
|---------|-------------|
| **HOST / JOIN** | First agent starts server (HOST), others connect (JOIN) |
| **Crash Recovery** | SQLite (node:sqlite, WAL mode) persists agents/tasks across restarts |
| **Smart Routing** | Tag + skill + keyword matching via SmartRouter (uses js-yaml) |
| **SSE Streaming** | Real-time result streaming with auto-reconnect (exponential backoff) |
| **Multi-turn** | Agents ask questions (INPUT_REQUIRED), planner responds |
| **MemPalace** | Optional agent memory — LLM-driven via promptGuidelines (Option D) |

## Tutorials

| Tutorial | Description |
|----------|-------------|
| [BTC Trading](./tutorials/btc-trading/README.md) | Multi-agent app: backend + frontend + security |

## Reference

| File | Description |
|------|-------------|
| [README.md](../README.md) | Project overview + crash recovery + performance |
| [ROADMAP.md](../ROADMAP.md) | Version history + planned features |
| [config/pipal-a2a.yaml](../config/pipal-a2a.yaml) | Main configuration (sharedState, dbPath, mempalace) |
| [config/team.yaml](../config/team.yaml) | Agent roles and workflows |

## Tests

```bash
npm test    # 163 tests, 16 files
```

### Test Categories

| Category | Files | Tests |
|----------|-------|-------|
| Core | `core.test.ts` | Data model, immutability, factories |
| Application | `registry.test.ts`, `router.test.ts` | Registry CRUD, routing |
| Infrastructure | `shared-state.test.ts`, `state-store.test.ts` | Server, SQLite, JSON-RPC |
| Crash Recovery | `crash-recovery.test.ts`, `crash-recovery-real.test.ts`, `reregister-bug.test.ts` | 8 crash scenarios |
| SSE | `sse-reconnect.test.ts` | Reconnect with backoff |
| Routing | `smart-router.test.ts`, `tags-integration.test.ts`, `e2e-router.test.ts` | Tag matching, workflows |
| E2E | `e2e.test.ts`, `e2e-full.test.ts` | Full delegation flow |
| Extension | `task-clarity.test.ts`, `extension-load.ts`, `incoming-task.ts` | Tools, clarity guard |

## Reports

| Report | Description |
|--------|-------------|
| [Code Review](./CODE_REVIEW.md) | Security audit results (v0.3.1 — all 11 issues fixed) |
