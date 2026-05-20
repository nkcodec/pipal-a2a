# Backend Agent - BTC Trading API

## Overview

The Backend Agent builds and maintains the **BTC Trading REST API** — a demo-grade trading backend that simulates real exchange operations without requiring actual API keys or network connectivity.

### What This Agent Does

1. **Creates Express.js REST APIs** with proper routing and validation
2. **Implements mock data services** for simulating exchange responses
3. **Manages in-memory state** for orders and balances
4. **Provides educational examples** of Node.js/Express patterns

---

## Files Created

```
btc-trading/backend/
├── server.js           # Main Express application entry point
├── package.json        # Project dependencies
├── models/
│   ├── mockData.js     # Simulated exchange price/orderbook data
│   ├── order.js        # In-memory order storage and CRUD operations
│   └── balance.js      # In-memory balance management
└── routes/
    ├── ticker.js       # GET /ticker - Price data endpoints
    ├── orderbook.js    # GET /orderbook - Order book data
    ├── order.js        # GET/POST/DELETE /order - Order management
    └── balance.js      # GET/POST /balance - Balance queries
```

---

## How the API Works

### Architecture Pattern

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│   Client    │────▶│  Express.js  │────▶│   Models    │
│  (cURL/CLI) │     │   Server     │     │ (Data Layer)│
└─────────────┘     └──────────────┘     └─────────────┘
                          │
                    ┌─────▼─────┐
                    │  Routes   │
                    │ (Endpoints)│
                    └───────────┘
```

### Request-Response Flow

1. **Request arrives** at Express server (port 3000)
2. **Router matches** URL to appropriate route file
3. **Validation** checks required fields and types
4. **Model operations** create/read/update data
5. **JSON response** returned to client

---

## API Endpoints

### 1. GET /ticker - Price Data

Returns BTC/USD or BTC/USDT prices from mock exchanges.

```bash
# Get all exchanges at once
curl http://localhost:3000/ticker

# Get specific exchange
curl http://localhost:3000/ticker?exchange=binance
```

**Query Parameters:**
| Param | Type | Description |
|-------|------|-------------|
| exchange | string | `binance`, `coinbase`, or `kraken` |

**Response Example:**
```json
{
  "symbol": "BTC/USDT",
  "price": 67450.25,
  "change24h": 2.34,
  "high24h": 68100.00,
  "low24h": 66100.00,
  "volume24h": 32450.67,
  "exchange": "binance"
}
```

---

### 2. GET /orderbook - Order Book Data

Returns simulated bid/ask orders for depth visualization.

```bash
curl http://localhost:3000/orderbook?exchange=binance
```

**Response Example:**
```json
{
  "exchange": "binance",
  "bids": [
    { "price": 67448.25, "amount": 2.3415 },
    { "price": 67445.10, "amount": 1.8923 }
  ],
  "asks": [
    { "price": 67452.80, "amount": 0.5234 },
    { "price": 67455.30, "amount": 1.2045 }
  ]
}
```

---

### 3. POST /order - Create Order

Places a new trading order (market or limit).

```bash
curl -X POST http://localhost:3000/order \
  -H "Content-Type: application/json" \
  -d '{
    "type": "market",
    "side": "buy",
    "amount": 0.5,
    "exchange": "binance"
  }'
```

**Request Body:**
| Field | Type | Required | Values |
|-------|------|----------|--------|
| type | string | Yes | `market`, `limit` |
| side | string | Yes | `buy`, `sell` |
| amount | number | Yes | Positive decimal |
| exchange | string | Yes | `binance`, `coinbase`, `kraken` |
| price | number | For limit only | Execution price |

**Order Lifecycle:**
```
pending → open → filled
              → cancelled
```

---

### 4. GET /order - List Orders

```bash
# All orders
curl http://localhost:3000/order

# Filter by exchange
curl http://localhost:3000/order?exchange=kraken

# Filter by status
curl http://localhost:3000/order?status=filled
```

---

### 5. DELETE /order/:id - Cancel Order

```bash
curl -X DELETE http://localhost:3000/order/1
```

---

### 6. GET /balance - Account Balances

```bash
curl http://localhost:3000/balance
```

**Response Example:**
```json
{
  "balances": {
    "USD": 100000.00,
    "BTC": 1.5,
    "USDT": 50000.00
  },
  "summary": {
    "totalUSD": 201675.00,
    "btcValue": 101175.00
  }
}
```

---

## Model Layer

### mockData.js - Exchange Simulation

```javascript
// Mock price data for different exchanges
const mockPrices = {
  binance: { symbol: 'BTC/USDT', price: 67450.25, ... },
  coinbase: { symbol: 'BTC/USD', price: 67455.00, ... },
  kraken: { symbol: 'BTC/USD', price: 67448.75, ... }
};

// Generates realistic orderbook depth
const generateOrderBook = (exchange) => {
  const basePrice = mockPrices[exchange].price;
  // Returns 10 bids and 10 asks around current price
};

module.exports = { mockPrices, generateOrderBook };
```

### order.js - Order Storage

```javascript
const Order = {
  create: (orderData) => { /* Adds to in-memory array */ },
  findAll: () => orders,
  findById: (id) => orders.find(o => o.id === id),
  updateStatus: (id, status) => { /* Updates order */ }
};
```

### balance.js - Balance Tracking

```javascript
const balances = { USD: 100000, BTC: 1.5, USDT: 50000 };

const Balance = {
  get: (asset) => balances[asset] || 0,
  update: (asset, amount) => { balances[asset] += amount; },
  reset: () => { /* Reset to defaults */ }
};
```

---

## Validation Examples

The API validates all inputs before processing:

```javascript
// Example from order.js route
if (!['limit', 'market'].includes(type)) {
  return res.status(400).json({ 
    error: 'type must be "limit" or "market"' 
  });
}

// Check sufficient balance before order
if (side === 'buy' && Balance.get('USD') < required) {
  return res.status(400).json({ 
    error: 'Insufficient USD balance',
    required,
    available: Balance.get('USD')
  });
}
```

---

## Running the Server

### Installation

```bash
cd btc-trading/backend
npm install
```

### Start Server

```bash
npm start
# Server running on http://localhost:3000
```

### Quick Test Script

```javascript
// test-api.js
const http = require('http');

function req(method, path, body) {
  return new Promise((resolve, reject) => {
    const opts = { hostname: 'localhost', port: 3000, path, method };
    if (body) opts.headers = { 'Content-Type': 'application/json' };
    const req = http.request(opts, res => {
      let data = '';
      res.on('data', c => data += c);
      res.on('end', () => resolve(JSON.parse(data)));
    });
    if (body) req.write(JSON.stringify(body));
    req.end();
  });
}

async function test() {
  // Check ticker
  console.log(await req('GET', '/ticker?exchange=binance'));
  
  // Create order
  console.log(await req('POST', '/order', {
    type: 'market', side: 'buy', amount: 0.1, exchange: 'kraken'
  }));
  
  // Check balance
  console.log(await req('GET', '/balance'));
}

test();
```

---

## Extension Points

To extend this API:

1. **Add real exchange APIs** → Replace mockData with axios calls to Binance/Coinbase APIs
2. **Add persistence** → Replace in-memory storage with SQLite or PostgreSQL
3. **Add authentication** → Add JWT middleware for protected routes
4. **Add WebSocket** → Add Socket.IO for real-time orderbook updates
5. **Add rate limiting** → Use express-rate-limit middleware

---

## Dependencies

```json
{
  "express": "^4.18.2"
}
```

Single dependency keeps the demo simple and educational.
