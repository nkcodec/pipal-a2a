# Quick Start Guide

## 5-Minute Setup

### 1. Clone and Install
```bash
cd ~/app/projects/pi-extensions/pipal-a2a
npm install
```

### 2. Configure
```bash
cp .env.example .env  # Add your API keys
```

### 3. Start Session
```bash
tmux new-session -d -s agents "pi"
```

### 4. Add Agents
```bash
tmux new-window -t agents -n backend "PIPAL_ROLE=backend pi"
tmux new-window -t agents -n security "PIPAL_ROLE=security pi"
tmux new-window -t agents -n data "PIPAL_ROLE=data pi"
tmux new-window -t agents -n frontend "PIPAL_ROLE=frontend pi"
tmux new-window -t agents -n reviewer "PIPAL_ROLE=reviewer pi"
```

### 5. Attach and Run
```bash
tmux attach -t agents

# In planner window, type:
"build btc-trading"
```

## What Happens

1. PreHook matches "btc-trading" workflow
2. Creates `btc-trading/` directory
3. Delegates to backend → builds API
4. Delegates to security → audits code
5. Delegates to data → builds price feed
6. Delegates to frontend → builds UI
7. Delegates to reviewer → final review

## tmux Cheat Sheet

```bash
# Attach to agents
tmux attach -t agents

# Switch windows
Ctrl+b n        # Next
Ctrl+b p        # Previous
Ctrl+b 0-5      # Jump to window
Ctrl+b d        # Detach (keep running)

# Split pane
Ctrl+b "        # Horizontal
Ctrl+b %        # Vertical
```

## Next Steps

- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
- [Workflow Setup](./WORKFLOW_SETUP.md)
- [BTC Trading Case Study](./BTC_TRADING_CASE_STUDY.md)
- [Agent Documentation](../agents/)
