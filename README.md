# PiPal-A2A

**Peer-to-peer multi-agent orchestration via A2A protocol**

## Core Sentence
Route tasks between agents using the Agent-to-Agent (A2A) protocol — agents discover and communicate directly without a central orchestrator.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                         CLI                                 │
│              pipal-a2a <command> [args]                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    APPLICATION                              │
│     AgentRegistry + TaskRouter + MessageBus                │
│     (coordinates agent discovery and task delivery)        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                        CORE                                 │
│     A2AMessage + TaskResult (pure data, frozen)            │
│     No agent logic here — only message types               │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    INFRASTRUCTURE                          │
│     A2AServer + A2AClient + AgentCard + SkillRegistry      │
│     HTTP transport, SSE streaming, pi-agent integration   │
└─────────────────────────────────────────────────────────────┘
```

## Key Design Decisions

### Q1 Core: Route A2A messages between agents
Messages flow peer-to-peer. No central brain decides execution order — agents negotiate via structured messages.

### Q2 Extensions: Internal only (no third-party at v1)
Manual registration. Portal system deferred.

### Q3 Extension Types: N/A for v1
PiPal-A2A is a protocol layer, not an extensible pipeline. Extension comes from agent discovery, not code plugins.

### Q4 Language: TypeScript
Node.js MCP SDK compatibility, express for HTTP, SSE for streaming.

### Q5 Distribution: Git clone only at v1
npm package deferred until protocol stabilizes.

### Q6 Trust: Own team only

### Q7 Context: Greenfield

---

## Layer Rules (karpathy-clean-code)

- **Core** knows nothing about infrastructure (no HTTP, no SDK imports)
- **SDK** defines message types only — no implementation
- **Infrastructure** implements A2A transport — imports Core + SDK only
- **Application** orchestrates — no business logic
- **CLI** wires config → registry → pipeline

## A2A Protocol (Google @a2a-js/sdk pattern)

### Agent Card
```json
{
  "name": "orchestrator",
  "skills": ["planning", "delegation"],
  "endpoint": "http://localhost:4001",
  "version": "1.0.0"
}
```

### Task Message
```json
{
  "id": "task-uuid",
  "from": "orchestrator",
  "to": "backend-worker",
  "action": "execute",
  "payload": { "task": "Implement feature X" },
  "skill": "code-generation"
}
```

### Events
- `task:pending` → agent picked up task
- `task:thinking` → agent processing
- `task:done` → agent completed
- `task:error` → agent failed
- `task:delegated` → agent forwarded to peer

---

## File Layout

```
pipal-a2a/
├── src/
│   ├── core/           # A2AMessage, TaskResult (pure types, frozen)
│   ├── sdk/            # Protocol interfaces (types only)
│   ├── infrastructure/ # A2AServer, A2AClient, AgentCard, pi-agent adapter
│   ├── application/    # AgentRegistry, TaskRouter, MessageBus
│   └── cli/            # CLI entry point
├── config/
│   └── agents.yaml     # Agent definitions (name, skills, endpoint)
├── public/
│   └── dashboard.html  # Real-time agent communication visualization
├── tests/
│   └── core.test.ts    # Core type tests only
└── package.json
```

---

## Why A2A over Central Orchestrator?

| Aspect | PiPal (orchestrator) | PiPal-A2A (peer-to-peer) |
|--------|---------------------|-------------------------|
| Control | Central brain decides all | Agents negotiate directly |
| Tracing | Single source of truth | Distributed events |
| Flexibility | Fixed step order | Dynamic agent collaboration |
| Debugging | Easy (one thread) | Complex (many threads) |
| Use case | Pre-defined pipelines | Emergent workflows |

---

## Status

**🔬 Experimental** — not ready for production. Focus is protocol design and minimal viable implementation.