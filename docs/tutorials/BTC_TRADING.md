# Tutorial: Multi-Agent BTC Trading App

This tutorial shows how to use pipal-a2a to build a real project with multiple agents.

## What We Built

A BTC trading dashboard with:
- **Backend**: Express API with price simulator
- **Frontend**: React dashboard with live price chart
- **Security review**: Automated security audit
- **Data pipeline**: Price data generation

## Step 1: Start All Agents

```bash
# Terminal 1 — backend
PIPAL_ROLE=backend pi

# Terminal 2 — frontend  
PIPAL_ROLE=frontend pi

# Terminal 3 — reviewer
PIPAL_ROLE=reviewer pi

# Terminal 4 — security
PIPAL_ROLE=security pi

# Terminal 5 — planner (you)
PIPAL_ROLE=planner pi
```

## Step 2: Delegate Backend

```
pipal_a2a_delegate({
  task: "Build a Node.js Express API for BTC trading in ./btc-trading/backend/. Include: price ticker endpoint, order placement endpoint, mock data for prices. Use port 3001.",
  to: "backend"
})
```

Backend creates:
```
btc-trading/backend/
├── server.js          # Express server
├── routes/ticker.js   # Price ticker API
├── routes/order.js    # Order placement API
├── models/Order.js    # Order model
├── data/mockData.js   # Mock price data
└── package.json
```

## Step 3: Delegate Security Review

```
pipal_a2a_delegate({
  task: "Review the BTC trading backend code in ./btc-trading/backend/ for security vulnerabilities. Check for: SQL injection, XSS, CSRF, input validation, rate limiting. Write report to btc-trading/security-report.md",
  to: "security"
})
```

## Step 4: Delegate Frontend

```
pipal_a2a_delegate({
  task: "Build a React frontend for the BTC trading app in ./btc-trading/frontend/. Show live price chart, order form, and order history. Connect to backend at localhost:3001.",
  to: "frontend"
})
```

## Step 5: Or Use Workflow Mode

All of the above can be done in one command:

```yaml
# config/team.yaml
workflows:
  build btc-trading:
    working_dir: "./btc-trading"
    steps:
      - role: backend
        task: "Build Express API for BTC trading with price ticker and order endpoints"
      - role: security
        task: "Review backend code for security issues, write security-report.md"
      - role: frontend
        task: "Build React dashboard showing live prices and order form"
```

Then:

```
pipal_a2a_delegate({ task: "build btc-trading" })
```

## Key Takeaways

1. **Each agent works independently** — no shared state between them
2. **Planner orchestrates** — you decide who does what
3. **Workflows automate** — define once, run many times
4. **Results stream back** — see progress in real-time
5. **MemPalace tracks** — (if enabled) all completions logged

## File Structure After

```
btc-trading/
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── data/
│   └── package.json
├── frontend/
│   ├── src/App.js
│   └── package.json
├── data/
│   └── price-simulator.js
├── security-report.md
└── review-report.md
```
