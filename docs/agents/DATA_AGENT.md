# DATA_AGENT — Market Data Feed Agent

## Overview

The DATA_AGENT is responsible for providing real-time market data to the trading system. It simulates live cryptocurrency price feeds using a price simulator that generates realistic price movements for BTC, ETH, and SOL trading pairs.

**Key Responsibilities:**
- Emit real-time price updates every 5 seconds
- Simulate realistic market behavior (mean reversion, volatility)
- Serve price data via Server-Sent Events (SSE)
- Provide health check endpoints for monitoring

---

## Price Simulator (`btc-trading/data/price-simulator.js`)

The price simulator generates synthetic market data that mimics real cryptocurrency price movements. This is useful for:
- Testing trading algorithms without API costs
- Developing UIs that display live prices
- Simulating different market conditions

### Supported Trading Pairs

| Pair | Base Price | Volatility | Min Price | Max Price |
|------|------------|------------|-----------|-----------|
| BTC  | $67,500    | 0.20%      | $60,000   | $75,000   |
| ETH  | $3,450     | 0.30%      | $3,000    | $4,000    |
| SOL  | $145       | 0.40%      | $100      | $200      |

### Core Functions

```javascript
// Generate a single price update for all pairs
const update = generatePriceUpdate();
// Returns: { timestamp: 1716200000000, pairs: { BTC: {...}, ETH: {...}, SOL: {...} } }

// Update price for a specific pair
const newPrice = updatePrice('BTC');

// Start standalone server
startStandaloneServer(3001);
```

### API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/prices` | GET | SSE stream with live price updates |
| `/health` | GET | Current prices and system status |

---

## How Price Simulation Works

### Random Walk with Mean Reversion

Real market prices don't move randomly — they tend to return to a "fair value" over time. The simulator models this behavior with two components:

#### 1. Random Movement (Volatility)
```javascript
const randomMove = (Math.random() - 0.5) * 2 * volatility * currentPrice;
```
- `Math.random() - 0.5` generates a value between -0.5 and 0.5
- Multiplied by 2 gives range: -1 to 1
- Scaled by volatility and current price

**Example:** For BTC with 0.2% volatility at $67,500:
- Max single move = $67,500 × 0.002 × 1 = ±$135 per tick

#### 2. Mean Reversion (Drift)
```javascript
const drift = (basePrice - currentPrice) * 0.01;
```
- If price is below base price, drift pushes it up
- If price is above base price, drift pushes it down
- 0.01 = 1% reversion strength per tick

**Example:** If BTC drops to $65,000:
- Drift = ($67,500 - $65,000) × 0.01 = +$25 (pulling back up)

#### 3. Price Bounds
```javascript
newPrice = Math.max(minPrice, Math.min(maxPrice, newPrice));
```
- Prevents prices from going outside realistic ranges
- BTC won't go below $60,000 or above $75,000

### Volatility Explained

**Volatility** measures how much a price typically moves. Higher volatility = more dramatic swings.

| Asset | Volatility | Character |
|-------|------------|-----------|
| BTC | 0.20% | Relatively stable (it's the "blue chip") |
| ETH | 0.30% | Moderate swings |
| SOL | 0.40% | Higher risk, more volatile |

**Real-world comparison:**
- S&P 500 daily volatility: ~1%
- BTC daily volatility: ~3-5%
- Our 5-second ticks are much smaller (÷~17000 for 5s intervals)

---

## Server-Sent Events (SSE)

### What is SSE?

**Server-Sent Events** is a simple protocol for pushing real-time updates from server to client over HTTP. Unlike WebSockets, it's one-way only (server → client), making it perfect for price feeds.

### How SSE Works

```
Client                           Server
  |                                |
  |──── GET /prices (HTTP) ───────▶|
  |                                |
  │◀──── text/event-stream ────────│
  │     Content-Type: text/event-stream
  │                                |
  │◀──── data: {...}\n\n ──────────│  ← Price update
  │                                │
  │◀──── data: {...}\n\n ──────────│  ← Next update (5s)
  │                                |
  │     ... continues ...          │
```

### SSE Message Format

Each message follows this format:
```
data: {"timestamp":1716200000000,"pairs":{"BTC":{"price":67523.45,...}}}
\n\n
```

- `data:` prefix indicates the payload
- `\n\n` (double newline) marks end of message
- Client reads stream and parses each message

### Why SSE for Price Feeds?

| Feature | SSE | WebSocket | Polling |
|---------|-----|-----------|---------|
| Direction | Server → Client | Bidirectional | Client pulls |
| Setup complexity | Simple | Complex | Simple |
| Browser support | Native | Good | Universal |
| Auto-reconnect | Built-in | Manual | N/A |
| Best for | One-way streams | Complex interactions | Simple apps |

**SSE is ideal here** because price feeds only need to push data one direction.

### Client Example

```javascript
const eventSource = new EventSource('http://localhost:3001/prices');

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('Price update:', data.pairs.BTC.price);
};

eventSource.onerror = (err) => {
  console.error('SSE error:', err);
  eventSource.close();
};
```

---

## Running and Testing

### Start the Simulator

```bash
cd btc-trading
node data/price-simulator.js
```

Output:
```
Price simulator running at http://localhost:3001
SSE stream: http://localhost:3001/prices
Health check: http://localhost:3001/health
```

### Test with curl

**Health check (JSON response):**
```bash
curl http://localhost:3001/health
```
Response:
```json
{"status":"ok","prices":{"BTC":67500,"ETH":3450,"SOL":145}}
```

**SSE stream (press Ctrl+C to stop):**
```bash
curl -N http://localhost:3001/prices
```
Response:
```
data: {"timestamp":1716200000000,"pairs":{"BTC":{"price":67523.45,"change24h":0.03,"high24h":75000,"low24h":60000},...}}
```

### Test with Browser

Open `http://localhost:3001/health` in browser to see JSON. For SSE, use JavaScript in DevTools:

```javascript
const es = new EventSource('http://localhost:3001/prices');
es.onmessage = (e) => console.log(JSON.parse(e.data));
```

### Integrate with Express

```javascript
const express = require('express');
const { createSSEStream } = require('./data/price-simulator');

const app = express();

app.get('/stream/prices', createSSEStream);

app.listen(3000, () => {
  console.log('Server running on port 3000');
});
```

---

## Sample Output

```json
{
  "timestamp": 1716200000000,
  "pairs": {
    "BTC": {
      "price": 67843.21,
      "change24h": 1.42,
      "high24h": 75000,
      "low24h": 60000
    },
    "ETH": {
      "price": 3512.55,
      "change24h": 1.81,
      "high24h": 4000,
      "low24h": 3000
    },
    "SOL": {
      "price": 142.30,
      "change24h": -1.86,
      "high24h": 200,
      "low24h": 100
    }
  }
}
```

---

## Configuration

To add new trading pairs, modify the `pairs` object:

```javascript
const pairs = {
  BTC: { basePrice: 67500, volatility: 0.002, minPrice: 60000, maxPrice: 75000 },
  // Add new pair:
  DOGE: { basePrice: 0.15, volatility: 0.005, minPrice: 0.10, maxPrice: 0.25 },
};
```

The simulator will automatically include it in all price updates.
