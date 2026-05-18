# PiPal-A2A

**P2P multi-agent orchestration — a pi extension**

## What is PiPal-A2A?

PiPal-A2A is a **pi extension** that adds P2P multi-agent coordination to the pi coding agent. The LLM gets a new tool (`pipal_a2a_delegate`) that delegates subtasks to a network of specialized peer agents — each backed by their own `createAgentSession()` from `@earendil-works/pi-coding-agent`.

**One sentence core:** Route tasks to specialized LLM agents via P2P A2A messages and return results.

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                   PI TUI (USER)                         │
│                                                          │
│   User: "Build login API with security review"          │
│                                                          │
│   pi's LLM sees: pipal_a2a_delegate tool                │
│   Calls it with task + skill → routes to peer network   │
│   Results stream back into the pi conversation           │
└─────────────────────────────────────────────────────────┘
                         │
                         │ Extension API
                         ▼
┌─────────────────────────────────────────────────────────┐
│              PiPal-A2A Extension                        │
│                                                          │
│   Registers:                                             │
│   - Tool: pipal_a2a_delegate(task, skill?, to?)         │
│   - Command: /pipal-status                              │
│   - Event: session_start → bootstrap network            │
│   - Event: session_shutdown → teardown network          │
└─────────────────────────────────────────────────────────┘
                         │
                         │ bootstrapNetwork()
                         ▼
┌─────────────────────────────────────────────────────────┐
│              P2P AGENT NETWORK                          │
│                                                          │
│   ┌───────────┐  ┌───────────┐  ┌───────────┐          │
│   │ planner   │  │ backend   │  │ security  │          │
│   │           │  │ worker    │  │ reviewer  │          │
│   │ pi SDK    │  │ pi SDK    │  │ pi SDK    │          │
│   │ session   │  │ session   │  │ session   │          │
│   └─────┬─────┘  └─────┬─────┘  └─────┬─────┘          │
│         │              │              │                  │
│         └────── HTTP + SSE ──────────┘                  │
│                      │                                   │
│              ┌───────┴───────┐                           │
│              │ Shared State  │                           │
│              │ (blackboard)  │                           │
│              └───────────────┘                           │
└─────────────────────────────────────────────────────────┘
```

## Clean Architecture Layers

```
┌─────────────────────────────────────────────────────────┐
│  EXTENSION (entry point for pi)                          │
│  Registers tools, commands, event handlers into pi       │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  CLI (alternative entry point for standalone usage)      │
│  Same bootstrapNetwork(), different wiring               │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  APPLICATION (registry, router, agent, network factory)  │
│  Coordinates flow — no business logic                    │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  INFRASTRUCTURE (transport, pi-runtime)                  │
│  Implements SDK interfaces with real I/O                 │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  BUILTIN (default implementations)                       │
│  SkillMatcher — default routing strategy                 │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  SDK (interfaces + types only — zero implementation)     │
│  One import path: pipal-a2a/sdk                          │
└─────────────────────────────────────────────────────────┘
                         │
┌─────────────────────────────────────────────────────────┐
│  CORE (frozen data types — zero imports from layers)     │
│  A2AMessage, TaskResult, AgentCard, Skill                │
└─────────────────────────────────────────────────────────┘
```

**Layer rules (dependency direction):**
- Core → imports nothing from other layers
- SDK → imports Core types only
- Builtin → imports SDK interfaces only
- Infrastructure → imports SDK interfaces + Core types
- Application → imports SDK interfaces + Core types (never infrastructure)
- Extension/CLI → imports Application + Infrastructure (top-level wiring only)

## File Structure

```
pipal-a2a/
├── src/
│   ├── core/
│   │   └── types.ts              # Frozen core — pure data types, zero imports
│   ├── sdk/
│   │   └── index.ts              # Public API — interfaces + types only
│   ├── builtin/
│   │   └── skill-matcher.ts      # Default routing strategy (implements SDK interface)
│   ├── infrastructure/
│   │   ├── transport.ts          # HTTP + SSE transport (implements SDK Transport)
│   │   └── pi-runtime.ts         # Wraps createAgentSession() (implements SDK AgentRuntime)
│   ├── application/
│   │   ├── registry.ts           # In-memory agent registry (implements SDK AgentRegistry)
│   │   ├── router.ts             # Default task router (implements SDK TaskRouter)
│   │   ├── agent.ts              # Agent runtime: handles messages, delegates tasks
│   │   └── network.ts            # Factory: bootstrap an entire peer network
│   ├── extension/
│   │   └── index.ts              # pi extension entry point (export default function)
│   └── cli/
│       └── index.ts              # Standalone CLI (alternative to extension)
├── config/
│   └── agents.yaml               # Agent definitions (optional — defaults work)
├── tests/
│   ├── core.test.ts              # Layer 1: core types, no mocks
│   ├── registry.test.ts          # Layer 2: registry + router with stubs
│   ├── router.test.ts            # Layer 2: routing with stubs
│   └── e2e.test.ts               # Layer 3: full network, real HTTP
├── package.json                  # pi extension config in "pi" key
├── tsconfig.json
├── vitest.config.ts
├── README.md
└── ROADMAP.md
```

## Usage

### As a pi extension (primary usage)

```bash
# Install the extension
pi install ./pipal-a2a

# Or from npm (future)
pi install pipal-a2a

# Use in pi — the LLM automatically gets the delegation tool
pi
> "Build a login API and review it for security"

# The LLM calls pipal_a2a_delegate() under the hood
# Results flow back into the conversation

# Check agent network status
/pipal-status
```

### As a standalone CLI (alternative)

```bash
# Start all agents from config
npx pipal-a2a start

# Start a specific agent
npx pipal-a2a start backend-worker

# Show registered agents
npx pipal-a2a status

# Send a task directly
npx pipal-a2a send orchestrator backend-worker "Write hello world"
```

### Programmatic (SDK)

```typescript
import { bootstrapNetwork } from "pipal-a2a/application";

const network = await bootstrapNetwork();
const result = await network.delegate({
  task: "Build login API",
  skill: "code-generation",
});
console.log(result);
await network.shutdown();
```

## Key Design Decisions

| Decision | Choice | Why |
|----------|--------|-----|
| **Extension, not standalone** | pi extension with `export default function(pi)` | Pi IS the CLI. Users already use pi. |
| **P2P, not client-server** | Agents talk directly via HTTP | No central orchestrator bottleneck |
| **Not MCP** | HTTP + SSE for agent communication | MCP is for tool integration; A2A is for agent coordination |
| **SDK = types only** | Zero implementation in SDK | Stability promise for extension authors |
| **Core frozen after v1** | No behavior changes in core types | New behavior → extensions, not core |
| **One tool** | `pipal_a2a_delegate(task, skill?, to?)` | Simplicity. LLM calls one tool, network handles routing |

## karpathy-clean-code Compliance

- ✅ **Core frozen** — `types.ts` has ZERO imports from other layers
- ✅ **SDK = types only** — interfaces, no implementation
- ✅ **Builtin implements SDK interfaces** — SkillMatcher is outside SDK
- ✅ **Application has no business logic** — coordinates flow only
- ✅ **Infrastructure implements SDK** — Transport, PiAgentRuntime
- ✅ **Extension is built ON TOP of pi** — not inside it
- ✅ **No MCP for agent communication** — HTTP + A2A protocol
- ✅ **Three test layers** — Core (no mocks), Application (stubs), E2E (real)

## Status

**🔬 Experimental** — P2P coordination layer on top of `pi-coding-agent`
