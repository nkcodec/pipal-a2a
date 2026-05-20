# Workflow Setup Guide

## Prerequisites

1. **Install pipal-a2a**
   ```bash
   cd ~/app/projects/pi-extensions/pipal-a2a
   npm install
   ```

2. **Configure agents**
   ```bash
   cp config/pipal-a2a.example.yaml config/pipal-a2a.yaml
   # Edit with your settings
   ```

## Setting Up tmux Sessions

### Why tmux?
tmux allows running multiple terminal sessions in one window. Perfect for multi-agent workflows.

### One Session Per Agent (Recommended)

Create a single tmux session with multiple windows:

```bash
cd ~/app/projects/pi-extensions/pipal-a2a

# Create session with first window (planner)
tmux new-session -d -s agents "pi"

# Add windows for each agent
tmux new-window -t agents -n backend "PIPAL_ROLE=backend pi"
tmux new-window -t agents -n security "PIPAL_ROLE=security pi"
tmux new-window -t agents -n data "PIPAL_ROLE=data pi"
tmux new-window -t agents -n frontend "PIPAL_ROLE=frontend pi"
tmux new-window -t agents -n reviewer "PIPAL_ROLE=reviewer pi"

# Go to planner window
tmux select-window -t agents:0
```

### tmux Navigation Commands

```bash
# Attach to session
tmux attach -t agents

# Navigate between windows
Ctrl+b n        # Next window
Ctrl+b p        # Previous window
Ctrl+b 0-9      # Go to window by number
Ctrl+b w        # Interactive window list
Ctrl+b l        # Last window

# Detach (keep running)
Ctrl+b d

# Split window into panes
Ctrl+b "        # Split horizontally
Ctrl+b %        # Split vertically

# Kill session
tmux kill-session -t agents
```

### List All Sessions
```bash
tmux list-sessions
tmux list-windows -t agents
```

## Configuring team.yaml

Edit `config/team.yaml` to define workflows:

```yaml
roles:
  backend:
    name: "Backend Developer"
    skills: [code-generation, backend-implementation]
  # ... other roles

workflows:
  my-project:
    name: "My Project"
    working_dir: "my-project"
    steps:
      - role: backend
        task: "Build the API..."
      - role: frontend
        task: "Build the UI..."
        depends_on: [backend]
```

## Running a Workflow

### 1. Start all agent windows
```bash
# In tmux session, start each agent in its window
```

### 2. Delegate from planner
```
"build my-project"
```

### 3. Watch agents work
```bash
# Use Ctrl+b w to switch between windows
# Watch each agent complete their task
```

## Troubleshooting

### Agent not online
```bash
# Check shared state server is running
curl http://localhost:5000/health

# Restart the agent in its window
# Press Ctrl+c to interrupt, then restart
```

### Workflow not matching
Check `config/team.yaml`:
- Workflow name matches your task
- Agent roles are defined
- Steps are properly formatted

### Directory not created
The PreHook creates directories automatically. If not:
1. Check `src/extension/index.ts` has the directory creation code
2. Verify `working_dir` is set in workflow config

## Best Practices

1. **Start agents in order**: planner first, then others
2. **Use meaningful names**: Window names match agent roles
3. **Keep session alive**: Use `Ctrl+b d` to detach, not exit
4. **Monitor all windows**: Use `Ctrl+b w` to see all at once
5. **Clean up**: Kill old sessions before starting new ones

```bash
# Clean up before starting fresh
tmux kill-session -t agents 2>/dev/null
```
