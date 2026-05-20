# pipal-a2a Architecture Overview

## What is pipal-a2a?

**pipal-a2a** is a peer-to-peer multi-agent networking layer using Google's A2A (Agent-to-Agent) protocol v1.0. It enables multiple AI agents to collaborate on complex tasks.

## Core Concept

```
┌─────────────────────────────────────────────────────────┐
│                    pipal-a2a Network                    │
│                                                         │
│   ┌─────────┐      ┌─────────┐      ┌─────────┐        │
│   │ Planner │──────│ Backend │──────│Frontend │        │
│   └─────────┘      └─────────┘      └─────────┘        │
│        │                │                │             │
│        │           ┌─────────┐           │             │
│        └───────────│ Security│───────────┘             │
│                    └─────────┘                          │
│                         │                              │
│                    ┌─────────┐                          │
│                    │  Data   │                          │
│                    └─────────┘                          │
│                         │                              │
│                    ┌─────────┐                          │
│                    │ Reviewer│                          │
│                    └─────────┘                          │
└─────────────────────────────────────────────────────────┘
```

## Agent Roles

| Agent | Purpose | Skills |
|-------|---------|--------|
| **Planner** | Orchestrates workflow, delegates tasks | Planning, architecture, delegation |
| **Backend** | Builds APIs and server logic | Node.js, Express, API design |
| **Frontend** | Creates user interfaces | React, CSS, UI/UX |
| **Security** | Audits code for vulnerabilities | Security analysis, hardening |
| **Data** | Data pipelines and processing | Data processing, embeddings |
| **Reviewer** | Quality assurance, testing | Code review, testing |

## How It Works

### 1. Agent Registration
Each agent registers with a shared state server:
```
Agent starts → Registers name, skills, tags → Available to network
```

### 2. Task Delegation
The planner matches tasks to agents:
```
You: "build btc-trading"
     ↓
Planner matches workflow
     ↓
Delegates to backend: "Build trading API"
Delegates to security: "Audit for vulnerabilities"
...
```

### 3. Workflow PreHook
The PreHook intercepts tasks and matches them to workflows in `team.yaml`:
```yaml
workflows:
  btc-trading:
    name: "BTC Trading System"
    working_dir: "btc-trading"
    steps:
      - role: backend
        task: "Build exchange API adapter..."
```

### 4. Directory Isolation
Each workflow works in its own directory (created automatically):
```
pipal-a2a/           ← Main project (never touched by agents)
├── src/             ← pipal-a2a source code
├── config/          ← Configuration
└── btc-trading/     ← Agent's workspace
    ├── backend/
    ├── frontend/
    └── data/
```

## Key Files

| File | Purpose |
|------|---------|
| `config/team.yaml` | Agent roles, skills, workflows |
| `config/pipal-a2a.yaml` | Network settings, port, identity |
| `.env` | Secrets (API keys, not in git) |
| `src/extension/index.ts` | Core logic, PreHook, delegation |

## Communication Flow

```
1. Agent A creates task
   ↓
2. A2A protocol sends JSON-RPC message
   ↓
3. Shared state server routes to Agent B
   ↓
4. Agent B receives and processes
   ↓
5. Result sent back via A2A
```

## Next Steps

- [Quick Start Guide](./QUICK_START.md)
- [Setting Up tmux](./WORKFLOW_SETUP.md)
- [BTC Trading Case Study](./BTC_TRADING_CASE_STUDY.md)
- [Agent Documentation](../agents/)
