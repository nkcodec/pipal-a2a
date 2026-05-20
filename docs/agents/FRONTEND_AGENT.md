# Frontend Agent - BTC Trading UI

## Overview

The **Frontend Agent** is responsible for building user interfaces for trading applications. This document describes the React-based BTC Trading UI created for the pipal-a2a project.

## Project Structure

```
btc-trading/frontend/
├── public/
│   └── index.html          # HTML entry point
├── src/
│   ├── components/
│   │   ├── Ticker.js       # Live price display component
│   │   ├── OrderForm.js     # Buy/sell order form
│   │   └── OrderHistory.js  # Order history table
│   ├── hooks/
│   │   └── useApi.js        # API utilities and custom hooks
│   ├── App.js               # Main application component
│   ├── index.js             # React entry point
│   └── index.css            # Global styles
└── package.json             # Dependencies and scripts
```

---

## Components Explained

### 1. Ticker Component (`Ticker.js`)

**Purpose:** Displays live BTC prices from multiple cryptocurrency exchanges.

**Key Features:**
- Fetches price data from `GET /ticker` every 5 seconds
- Shows prices from Binance, Coinbase, and Kraken
- Displays 24h change, high, low, and volume
- Color-codes price movements (green for up, red for down)

**Code Example:**
```javascript
// Auto-refresh mechanism
useEffect(() => {
  const fetchPrices = async () => {
    const response = await fetch(`${API_BASE}/ticker`);
    const data = await response.json();
    setPrices({ binance: data.binance, coinbase: data.coinbase, kraken: data.kraken });
  };

  fetchPrices();
  const interval = setInterval(fetchPrices, 5000); // Poll every 5s

  return () => clearInterval(interval); // Cleanup on unmount
}, []);
```

**API Response Shape:**
```json
{
  "binance": { "symbol": "BTC/USDT", "price": 67450.25, "change24h": 2.34, "high24h": 68100, "low24h": 66100, "volume24h": 32450.67 },
  "coinbase": { ... },
  "kraken": { ... }
}
```

---

### 2. OrderForm Component (`OrderForm.js`)

**Purpose:** Allows users to place buy/sell orders for cryptocurrencies.

**Key Features:**
- Toggle between BUY and SELL modes
- Select order type: Market or Limit
- Choose exchange: Binance, Coinbase, or Kraken
- Input amount (supports BTC, ETH, SOL)
- Conditional price input for limit orders

**Order Flow:**
```javascript
const handleSubmit = async (e) => {
  e.preventDefault();
  
  const orderData = {
    type: 'market',      // or 'limit'
    side: 'buy',          // or 'sell'
    amount: 0.5,          // BTC amount
    exchange: 'binance'   // or 'coinbase', 'kraken'
  };

  // Add price for limit orders
  if (type === 'limit') {
    orderData.price = parseFloat(priceInput);
  }

  const result = await postOrder(orderData);
};
```

**API Call:** `POST /order`
```json
// Request
{ "type": "market", "side": "buy", "amount": 0.5, "exchange": "binance" }

// Response
{ "order": { "id": 1, "status": "filled", "side": "buy", ... } }
```

---

### 3. OrderHistory Component (`OrderHistory.js`)

**Purpose:** Displays a table of all placed orders with their current status.

**Key Features:**
- Fetches orders from `GET /order`
- Shows order ID, timestamp, exchange, type, side, amount, price, status
- Color-coded status badges (filled=green, open=yellow, cancelled=red)
- Auto-refreshes when a new order is placed

**Code Example:**
```javascript
// Refresh when parent signals order completion
useEffect(() => {
  const loadOrders = async () => {
    const result = await fetchOrders();
    setOrders(result.orders || []);
  };
  loadOrders();
}, [refreshKey]); // refreshKey changes on new order
```

**Table Columns:**
| Column | Description |
|--------|-------------|
| ID | Unique order identifier |
| Time | Order timestamp |
| Exchange | Trading venue (binance/coinbase/kraken) |
| Type | Market or Limit |
| Side | Buy or Sell |
| Amount | Quantity in BTC |
| Price | Execution price in USD |
| Status | filled / open / cancelled |

---

## API Integration

### Backend Connection

The frontend connects to the backend at `http://localhost:3000`.

```javascript
const API_BASE = 'http://localhost:3000';
```

### API Endpoints Used

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/` | GET | Health check |
| `/ticker` | GET | Fetch live BTC prices |
| `/order` | GET | List all orders |
| `/order` | POST | Create new order |
| `/order/:id` | DELETE | Cancel an order |

### useApi Hook (`useApi.js`)

Provides reusable fetch functionality with loading/error states:

```javascript
import { useApi } from './hooks/useApi';

function MyComponent() {
  const { data, loading, error, refetch } = useApi('/ticker');
  
  if (loading) return <div>Loading...</div>;
  if (error) return <div>Error: {error}</div>;
  
  return <div>Price: ${data.binance.price}</div>;
}
```

### Direct API Functions

```javascript
import { postOrder, fetchOrders } from './hooks/useApi';

// Place an order
const order = await postOrder({ type: 'market', side: 'buy', amount: 1, exchange: 'binance' });

// Get all orders
const { orders } = await fetchOrders();
```

---

## Running the Frontend

### Prerequisites

1. **Backend must be running** on port 3000:
   ```bash
   cd btc-trading/backend
   npm start
   # Backend running at http://localhost:3000
   ```

### Start the Frontend

```bash
cd btc-trading/frontend
npm install   # Only needed first time
npm start
```

The app will open at `http://localhost:3001` (React defaults to 3001 when 3000 is taken).

### Build for Production

```bash
cd btc-trading/frontend
npm run build
```

This creates an optimized build in `btc-trading/frontend/build/`.

---

## Styling

The frontend uses **plain CSS** (no Tailwind or CSS-in-JS):

- **Theme:** Dark trading platform aesthetic
- **Colors:** 
  - Background: `#0f0f1a`
  - Cards: `#1a1a2e`
  - Buy/Up: `#2ecc71` (green)
  - Sell/Down: `#e74c3c` (red)
  - Accent: `#f7931a` (Bitcoin orange)

All styles are defined in `src/index.css`.

---

## Architecture Notes

### Component Communication

```
App.js (Parent)
├── Ticker.js (fetches prices independently)
├── OrderForm.js (calls POST /order)
│   └── onOrderComplete callback → App
└── OrderHistory.js (receives refreshKey prop)
```

### State Management

- **Local state** via `useState` for component-specific data
- **Props** for parent-child communication
- **refreshKey** pattern forces OrderHistory to re-fetch after new orders

### Error Handling

Each component handles:
1. **Loading state** - shows spinner/placeholder
2. **Error state** - shows error message
3. **Success state** - displays data

```javascript
if (loading) return <LoadingSpinner />;
if (error) return <ErrorMessage error={error} />;
return <DataDisplay data={data} />;
```

---

## Extension Ideas

To extend this frontend:

1. **Add more cryptocurrencies** - Modify OrderForm to accept ETH/SOL
2. **Add order book visualization** - Fetch from `GET /orderbook`
3. **Add portfolio balance display** - Fetch from `GET /balance`
4. **Add real-time WebSocket** - Replace polling with WebSocket for live prices
5. **Add charts** - Integrate a charting library like Chart.js or Recharts

---

## Files Reference

| File | Lines | Purpose |
|------|-------|---------|
| `src/App.js` | ~70 | Main layout, connection status |
| `src/components/Ticker.js` | ~120 | Live price ticker |
| `src/components/OrderForm.js` | ~170 | Order entry form |
| `src/components/OrderHistory.js` | ~100 | Order history table |
| `src/hooks/useApi.js` | ~70 | API utilities |
| `src/index.css` | ~200 | All styling |
