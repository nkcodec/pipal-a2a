# Quick Start Guide

## 1. Install

```bash
cd pipal-a2a
npm install
```

## 2. Start Shared State Server

First terminal starts the server automatically:

```bash
PIPAL_ROLE=planner pi
```

You'll see:
```
[pipal-a2a] 🏠 HOST mode — shared state at http://localhost:5000
[pipal-a2a] ✅ Online as "planner" [planning, delegation] tags:[plan, architecture, design]
```

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

## 4. Delegate a Task

In planner terminal:

```
pipal_a2a_delegate({ 
  task: "Create a Node.js Express API for a todo app with CRUD endpoints",
  to: "backend" 
})
```

## 5. Use Workflow Mode

If `config/team.yaml` has a workflow named `build todo-app`:

```
pipal_a2a_delegate({ task: "build todo-app" })
```

This automatically delegates to backend → reviewer → frontend in sequence.

## What's Next?

- [Workflow Setup](./WORKFLOW_SETUP.md) — define multi-step workflows
- [MemPalace Test Plan](./MEMPALACE_TEST_PLAN.md) — optional agent memory
- [Roadmap](../ROADMAP.md) — planned features
