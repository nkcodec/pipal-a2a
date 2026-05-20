# Security Audit Report: btc-trading/backend/

**Date:** 2026-05-21  
**Scope:** Backend API security review  
**Target:** `btc-trading/backend/`

---

## Executive Summary

The backend API has **several security concerns** that should be addressed. While some input validation exists, multiple gaps were identified across injection, numeric validation, and data handling areas.

---

## Findings

### 🔴 HIGH - Injection Vulnerabilities

#### 1. Order ID Parsing Without Validation
**File:** `routes/order.js` (line 95)
```javascript
const order = Order.findById(parseInt(req.params.id));
```
- `parseInt()` with non-numeric input returns `NaN`
- `NaN` comparisons in `.find()` always return `false`, causing a 404 (acceptable)
- However, passing extremely large numbers could cause integer overflow issues in production

**Recommendation:** Add explicit validation:
```javascript
const id = parseInt(req.params.id);
if (isNaN(id) || id < 1) {
  return res.status(400).json({ error: 'Invalid order ID' });
}
```

#### 2. Exchange Parameter Used Directly
**File:** `routes/orderbook.js` (line 13)
```javascript
const orderbook = generateOrderBook(exchange.toLowerCase());
```
- The exchange parameter flows directly into `mockPrices` lookup
- While `.toLowerCase()` is used, no whitelist validation exists in this route
- If mockData is replaced with real API calls in production, this becomes SSRF-vulnerable

**Recommendation:** Add whitelist validation:
```javascript
const validExchanges = ['binance', 'coinbase', 'kraken'];
if (exchange && !validExchanges.includes(exchange.toLowerCase())) {
  return res.status(400).json({ 
    error: 'Invalid exchange',
    available: validExchanges
  });
}
```

---

### 🟡 MEDIUM - Input Validation Gaps

#### 3. Missing Numeric Validation for Amount
**File:** `routes/order.js` (lines 19, 35)
- `amount` is checked for existence but not type or range
- Negative amounts would pass through: `amount < 0`
- Zero amounts would pass through: `amount === 0`
- Very large numbers could cause floating-point precision issues

**Recommendation:** Add numeric validation:
```javascript
if (typeof amount !== 'number' || amount <= 0) {
  return res.status(400).json({ error: 'amount must be a positive number' });
}
```

#### 4. Missing Numeric Validation for Price
**File:** `routes/order.js` (lines 19, 44)
- `price` is required for limit orders but not validated as positive
- Same floating-point concerns as amount

**Recommendation:**
```javascript
if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
  return res.status(400).json({ error: 'price must be a positive number' });
}
```

#### 5. Balance Amount Not Validated
**File:** `routes/balance.js` (line 41)
```javascript
Balance.set(asset.toUpperCase(), amount);
```
- No validation that `amount` is a valid number
- Could set balances to `NaN`, `Infinity`, or negative values
- No upper bound check (could set USD to $9999999999999999)

**Recommendation:**
```javascript
if (typeof amount !== 'number' || isNaN(amount) || !isFinite(amount) || amount < 0) {
  return res.status(400).json({ error: 'amount must be a non-negative finite number' });
}
```

#### 6. Asset Name Not Validated
**File:** `routes/balance.js` (lines 25, 41)
```javascript
Balance.set(asset.toUpperCase(), amount);
```
- Asset parameter is not validated against known assets
- Could create arbitrary assets: `asset: "'; DROP TABLE users;--"`
- In a real database, this could lead to NoSQL injection if using MongoDB

**Recommendation:** Whitelist allowed assets:
```javascript
const validAssets = ['USD', 'BTC', 'USDT'];
if (!validAssets.includes(asset.toUpperCase())) {
  return res.status(400).json({ 
    error: 'Invalid asset',
    available: validAssets
  });
}
```

---

### 🟡 MEDIUM - SSRF Concerns

#### 7. Exchange Parameter Used for External Calls
**File:** `routes/ticker.js`, `routes/orderbook.js`, `routes/order.js`

All three routes accept an `exchange` parameter that, in a production environment with real API integrations, would be used to construct API endpoints. Currently:

- **Ticker route:** Has partial validation, returns 400 if exchange not in mockPrices
- **Orderbook route:** No validation, passes directly to `generateOrderBook()`
- **Order route:** Has whitelist validation with explicit exchange list

**Current validation in order.js:**
```javascript
if (!['binance', 'coinbase', 'kraken'].includes(exchange?.toLowerCase())) {
  return res.status(400).json({ error: 'exchange must be "binance", "coinbase", or "kraken"' });
}
```

**Recommendation:** Consolidate validation in a shared middleware:
```javascript
// Shared validation
const ALLOWED_EXCHANGES = ['binance', 'coinbase', 'kraken'];
const validateExchange = (req, res, next) => {
  const exchange = req.query.exchange || req.body?.exchange;
  if (exchange && !ALLOWED_EXCHANGES.includes(exchange.toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid exchange',
      allowed: ALLOWED_EXCHANGES
    });
  }
  next();
};
```

---

### 🟢 LOW - Good Practices Found

#### Positive Findings

1. **Status parameter in order listing** (`routes/order.js`, line 17) - Used only in `.filter()`, no direct string concatenation
2. **Express.json() middleware** - Proper body parsing configured
3. **Type validation for order type/side** - Uses array includes for allowlist
4. **HTTP status codes** - Proper 400/404/201 responses
5. **No raw SQL queries** - Using in-memory arrays, no SQL injection risk

---

## Summary Table

| ID | Severity | Category | Issue | Status |
|----|----------|----------|-------|--------|
| 1 | HIGH | Injection | Order ID parsing without validation | Should Fix |
| 2 | HIGH | SSRF | Exchange param in orderbook without validation | Should Fix |
| 3 | MEDIUM | Input | Amount not validated as positive number | Should Fix |
| 4 | MEDIUM | Input | Price not validated | Should Fix |
| 5 | MEDIUM | Input | Balance amount lacks bounds check | Should Fix |
| 6 | MEDIUM | Injection | Asset name not whitelisted | Should Fix |
| 7 | MEDIUM | SSRF | Exchange param used in multiple routes | Should Fix |

---

## Recommended Actions

1. **Immediate:** Add numeric validation for `amount` and `price` in order creation
2. **Immediate:** Whitelist `exchange` parameter in all routes
3. **Immediate:** Whitelist `asset` parameter in balance routes
4. **Short-term:** Add shared validation middleware for exchange parameter
5. **Production:** Before real API integration, implement URL allowlisting for external exchange calls

---

*Report generated by security audit*