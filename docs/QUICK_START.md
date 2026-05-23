# Quick Start Guide

## 1. Install

```bash
cd pipal-a2a
npm install
```

Requires Node.js v22+ (for `node:sqlite`).

## 2. Start Planner (HOST)

First terminal starts the server automatically:

```bash
PIPAL_ROLE=planner pi
```

You'll see:
```
[pipal-a2a] 🏠 HOST mode — shared state at http://localhost:5000
[pipal-a2a] ✅ Online as "planner" [planning, delegation] tags:[plan, architecture, design]
```

The server creates `.pipal-a2a/state.db` (SQLite) for crash-safe persistence.

## 3. Start Worker Agents

Each additional terminal joins the network:

```bash
# Terminal 2
PIPAL_ROLE=backend pi

# Terminal 3
PIPAL_ROLE=frontend pi

# Terminal 4
PIPAL_ROLE=reviewer pi
```

Each agent auto-discovers the server at `localhost:5000` and registers via SSE.

## 4. Delegate a Task

In the planner terminal:

```
pipal_a2a_delegate({ task: "Build a REST API with Express", to: "backend" })
```

Or use skill-based routing (SmartRouter picks the best agent):

```
pipal_a2a_delegate({ task: "Build a REST API with Express", skill: "nodejs" })
```

## 5. Crash Recovery

If the server crashes, just restart:

```bash
PIPAL_ROLE=planner pi   # reopens state.db, all agents/tasks restored
```

Agents auto-reconnect with exponential backoff and re-register.
In-flight tasks remain in their last state.

## 6. Use Workflow Mode

Define multi-step workflows in `config/team.yaml`:

```yaml
team:
  roles:
    planner:
      skills: [planning, delegation]
      tags: [plan]
    backend:
      skills: [code-generation, backend-implementation]
      tags: [node.js, express]
```

Then delegate with a workflow name and it routes to the right agent automatically.

## What's Next?

- [Workflow Setup](./WORKFLOW_SETUP.md) — define multi-step workflows
- [MemPalace Setup](./MEMPALACE_SETUP.md) — optional agent memory
- [Roadmap](../ROADMAP.md) — planned features
