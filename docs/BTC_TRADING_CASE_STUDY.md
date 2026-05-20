# BTC Trading System - Case Study

This document walks through the complete BTC Trading workflow as a real-world example of multi-agent collaboration.

## Project Overview

Goal: Build a complete BTC trading system with:
- Trading API (multiple exchanges)
- Market data feed
- Trading UI
- Security audit
- Code review

## Workflow Definition

The workflow is defined in `config/team.yaml`:

```yaml
workflows:
  btc-trading:
    name: "BTC Trading System"
    working_dir: "btc-trading"
    steps:
      - role: backend
        task: |
          Build a Node.js/Express trading API in btc-trading/backend/
          Requirements:
          - REST endpoints: GET /ticker, GET /orderbook, POST /order, GET /balance
          - Support mock data for Binance, Coinbase, Kraken
          - Use in-memory storage for orders and balances
          - Include: server.js, routes/, models/, package.json
      - role: security
        task: |
          Security audit for btc-trading/backend/
          Requirements:
          - Check for injection vulnerabilities
          - Verify input validation
          - Review for SSRF
          - Report findings in security-report.md
        depends_on: [backend]
      - role: data
        task: |
          Market data feed integration for btc-trading/
          Requirements:
          - Price simulator with configurable price ranges
          - Support BTC, ETH, SOL trading pairs
          - Emit price updates via SSE every 5 seconds
        depends_on: [backend]
      - role: frontend
        task: |
          Trading UI for btc-trading/frontend/
          Requirements:
          - React with basic CSS
          - Show live price ticker
          - Order form: buy/sell
          - Order history
        depends_on: [backend, data]
      - role: reviewer
        task: |
          Final code review for btc-trading/
          Requirements:
          - Verify all files compile
          - Check package.json scripts
          - Ensure no hardcoded secrets
          - Report status in review-report.md
        depends_on: [frontend]
```

## Step-by-Step Execution

### Step 1: User Triggers Workflow
```
User: "build btc-trading"
```

### Step 2: PreHook Intercepts
The PreHook in `src/extension/index.ts`:
1. Matches "btc-trading" to workflow
2. Creates `btc-trading/` directory
3. Starts delegating tasks

### Step 3: Backend Builds API
**Agent:** backend  
**Task:** Build exchange API adapter  
**Output:**
```
btc-trading/backend/
├── server.js           # Express server with CORS, logging
├── routes/
│   ├── ticker.js       # GET /ticker?exchange=X
│   ├── orderbook.js    # GET /orderbook?exchange=X
│   ├── order.js        # POST /order, GET /order, DELETE /order/:id
│   └── balance.js      # GET /balance, POST /balance
├── models/
│   ├── order.js        # Order state machine (pending→filled/cancelled)
│   └── balance.js      # BalanceStore (lock/credit/unlock)
└── data/
    └── mockData.js     # Binance, Coinbase, Kraken mock data
```

### Step 4: Security Audits Code
**Agent:** security  
**Task:** Audit for vulnerabilities  
**Output:** `security-report.md` with findings:

| Severity | Issue | Recommendation |
|----------|-------|----------------|
| HIGH | Order ID parsing without validation | Add explicit NaN check |
| HIGH | Exchange param in orderbook | Add whitelist validation |
| MEDIUM | Amount not validated as positive | Add numeric bounds |
| MEDIUM | Price not validated | Add type + range check |
| MEDIUM | Balance amount lacks bounds | Add isFinite check |
| MEDIUM | Asset name not whitelisted | Use asset whitelist |

### Step 5: Data Builds Price Feed
**Agent:** data  
**Task:** Market data integration  
**Output:** `btc-trading/data/price-simulator.js`

Features:
- BTC, ETH, SOL trading pairs
- Random walk + mean reversion algorithm
- SSE stream every 5 seconds
- Configurable volatility and price ranges

```javascript
// Key configuration
const pairs = {
  BTC: { basePrice: 67500, volatility: 0.002, minPrice: 60000, maxPrice: 75000 },
  ETH: { basePrice: 3450, volatility: 0.003, minPrice: 3000, maxPrice: 4000 },
  SOL: { basePrice: 145, volatility: 0.004, minPrice: 100, maxPrice: 200 }
};
```

### Step 6: Frontend Builds UI
**Agent:** frontend  
**Task:** Trading UI  
**Output:** `btc-trading/frontend/src/`

Components:
- `App.js` - Main layout, API connection status
- `Ticker.js` - Live price display
- `OrderForm.js` - Buy/sell form
- `OrderHistory.js` - Order list
- `useApi.js` - API hook

### Step 7: Reviewer Final Check
**Agent:** reviewer  
**Task:** Quality assurance  
**Output:** Review report

Checklist:
- [ ] All files compile without errors
- [ ] package.json has valid scripts
- [ ] No hardcoded secrets
- [ ] Error handling present
- [ ] Input validation complete

## Final Directory Structure

```
btc-trading/
├── backend/
│   ├── server.js
│   ├── routes/
│   ├── models/
│   ├── data/
│   ├── package.json
│   └── node_modules/
├── data/
│   └── price-simulator.js
├── frontend/
│   └── src/
│       ├── App.js
│       ├── components/
│       ├── hooks/
│       └── index.css
├── security-report.md
└── review-report.md
```

## How to Run

### Start Backend
```bash
cd btc-trading/backend
npm install
npm start
# Runs on port 3000
```

### Start Price Feed
```bash
cd btc-trading/data
node price-simulator.js
# Runs on port 3001
```

### Start Frontend
```bash
cd btc-trading/frontend
npm install
npm run dev
# Runs on port 3000 or next available
```

## Key Learnings

1. **Directory Isolation** - Each workflow gets its own directory, keeping projects separate
2. **Dependency Chains** - Steps with `depends_on` wait for previous steps
3. **Agent Specialization** - Each agent focuses on their domain
4. **Automated Documentation** - Agents create their own docs and reports
5. **Real Deliverables** - Working code, not just plans

## Related Documentation

- [Architecture Overview](./ARCHITECTURE_OVERVIEW.md)
- [Workflow Setup](./WORKFLOW_SETUP.md)
- [Backend Agent Docs](../agents/BACKEND_AGENT.md)
- [Security Agent Docs](../agents/SECURITY_AGENT.md)
- [Data Agent Docs](../agents/DATA_AGENT.md)
- [Frontend Agent Docs](../agents/FRONTEND_AGENT.md)
- [Reviewer Agent Docs](../agents/REVIEWER_AGENT.md)
