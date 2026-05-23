# Workflow Setup

## What Are Workflows?

Workflows are multi-step delegation sequences defined in `config/team.yaml`. When a task matches a workflow name, pipal-a2a automatically delegates to each step in order.

## Define a Workflow

Edit `config/team.yaml`:

```yaml
roles:
  planner:
    name: planner
    skills: [planning, delegation]
    tags: [plan, architecture, design]
  backend:
    name: backend
    skills: [code-generation, backend-implementation]
    tags: [node.js, express, api, backend]
  reviewer:
    name: reviewer
    skills: [code-review]
    tags: [review, testing, quality]
  frontend:
    name: frontend
    skills: [frontend-implementation]
    tags: [react, css, tailwind, ui]

workflows:
  build todo-app:
    working_dir: "./btc-trading"    # optional: agents work in this directory
    steps:
      - role: backend
        task: "Build a REST API for a todo app with CRUD endpoints using Express"
      - role: reviewer
        task: "Review the backend API code for security and quality"
      - role: frontend
        task: "Build a React frontend for the todo app"
```

## Trigger a Workflow

In planner terminal:

```
pipal_a2a_delegate({ task: "build todo-app" })
```

## How It Works

```
1. Planner sends "build todo-app"
2. PreHook matches workflow name
3. Step 1: delegate to backend → wait for result
4. Step 2: delegate to reviewer → wait for result
5. Step 3: delegate to frontend → wait for result
6. Return summary: "✅ backend: done\n✅ reviewer: done\n✅ frontend: done"
```

## Features

- **Sequential steps** — each step waits for previous to complete
- **Working directory** — agents work in specified directory
- **Graceful skip** — if an agent is offline, step is skipped with warning
- **MemPalace** — each step gets MemPalace reminder (if enabled)
- **Crash recovery** — if server restarts mid-workflow, agents reconnect and continue

## Example Output

```
Workflow "build todo-app" completed:
✅ backend: File created successfully
✅ reviewer: Code looks good, minor suggestions noted
⚠️ frontend: skipped (not online)
```

## Tips

- Keep workflow names short and descriptive (`build todo-app`, not `build a todo application`)
- Each step should be a clear, specific task
- Agents can be offline — steps are skipped gracefully
- Use `working_dir` to scope work to a specific directory
