# Reviewer Agent Guide

## Role Overview

The **Reviewer Agent** is responsible for performing comprehensive code reviews of software projects. It examines code quality, security, testing coverage, and verifies that projects compile and function correctly.

## Core Responsibilities

1. **Verify Compilation** - Ensure all code files are syntactically valid
2. **Check Package Scripts** - Validate that required npm scripts exist
3. **Scan for Secrets** - Detect hardcoded credentials, API keys, passwords
4. **Security Audit** - Identify vulnerabilities and security concerns
5. **Generate Reports** - Document findings in a structured review report

---

## Code Review Checklist

### 1. Readability

| Check | Description |
|-------|-------------|
| Naming conventions | Variables, functions follow consistent naming |
| Code organization | Logical file structure, proper separation of concerns |
| Comments | Complex logic is explained, no unnecessary comments |
| Formatting | Consistent indentation, spacing, and style |

**Example from btc-trading:**
```javascript
// ✅ Good: Clear, descriptive naming
const requiredUSDAmount = executionPrice * amount;
if (Balance.get('USD') < requiredUSDAmount) {
  return res.status(400).json({ error: 'Insufficient USD balance' });
}

// ❌ Bad: Unclear naming
const r = p * a;
if (b < r) { return res.status(400).json({ error: 'Error' }); }
```

### 2. Security

| Check | Description |
|-------|-------------|
| No hardcoded secrets | No API keys, passwords, tokens in source |
| Input validation | All user inputs are validated |
| Parameter allowlisting | Query/body params checked against allowed values |
| Type safety | Proper type checking, no unsafe conversions |

**Hardcoded Secret Patterns to Detect:**
```javascript
// ❌ Examples of hardcoded secrets to avoid
const API_KEY = 'sk_live_1234567890abcdef';
const PASSWORD = 'admin123';
const TOKEN = process.env.SOME_TOKEN || 'fallback_token';
const PRIVATE_KEY = '0x1234567890abcdef1234567890abcdef12345678';
```

**Input Validation Examples:**
```javascript
// ✅ Good: Validated and allowlisted
const validExchanges = ['binance', 'coinbase', 'kraken'];
if (!validExchanges.includes(exchange.toLowerCase())) {
  return res.status(400).json({ error: 'Invalid exchange' });
}

// ✅ Good: Type and range validation
if (typeof amount !== 'number' || amount <= 0) {
  return res.status(400).json({ error: 'amount must be positive' });
}

// ❌ Bad: No validation
Balance.set(asset.toUpperCase(), amount); // Could be NaN, Infinity, negative
```

### 3. Testing

| Check | Description |
|-------|-------------|
| Test script exists | `npm test` defined in package.json |
| Test coverage | Critical paths have test coverage |
| Test validity | Tests actually run and pass |

**Package.json Validation:**
```json
{
  "scripts": {
    "start": "node server.js",
    "test": "jest",  // ✅ Required
    "build": "tsc"   // ✅ For compiled languages
  }
}
```

### 4. Error Handling

| Check | Description |
|-------|-------------|
| Async errors caught | Promises have .catch() or try/catch |
| HTTP errors returned | Proper status codes (400, 404, 500) |
| Error messages | Helpful messages for debugging |
| Resource cleanup | Intervals, connections properly cleared |

**Error Handling Examples:**
```javascript
// ✅ Good: Proper async error handling
const fetchData = async () => {
  try {
    const response = await fetch(`${API_BASE}${endpoint}`);
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    setData(result);
  } catch (err) {
    setError(err.message); // Error state set for UI
  }
};

// ✅ Good: HTTP status codes
if (!order) {
  return res.status(404).json({ error: 'Order not found' });
}

if (Balance.get('BTC') < amount) {
  return res.status(400).json({ 
    error: 'Insufficient BTC balance',
    required: amount,
    available: Balance.get('BTC')
  });
};

// ✅ Good: Resource cleanup
const interval = setInterval(sendUpdate, 5000);
req.on('close', () => {
  clearInterval(interval);  // Cleanup on client disconnect
});
```

### 5. Compilation Verification

**JavaScript/Node.js:**
```bash
node --check file.js          # Syntax check only
node file.js                  # Full execution test
```

**For a complete check, run:**
```javascript
const { execSync } = require('child_process');

const files = ['server.js', 'routes/order.js', 'routes/balance.js'];
for (const file of files) {
  try {
    execSync(`node --check ${file}`);
    console.log(`✅ ${file} - syntax OK`);
  } catch (e) {
    console.log(`❌ ${file} - syntax error`);
  }
}
```

---

## How to Verify Code Compiles and Works

### Step 1: Syntax Validation

For each source file:
```bash
node --check backend/server.js
node --check backend/routes/order.js
node --check backend/routes/balance.js
```

### Step 2: Package.json Validation

Check for required scripts:
```bash
cat backend/package.json | grep -A5 '"scripts"'
```

Required scripts:
- `start` - Required for any runnable project
- `test` - Required for testing frameworks
- `build` - Required for compiled/transpiled languages

### Step 3: Secret Scanning

Search for common secret patterns:
```javascript
const secretPatterns = [
  /api[_-]?key/i,
  /secret[_-]?key/i,
  /password/i,
  /token/i,
  /sk_live/i,
  /pk_live/i,
  /0x[a-f0-9]{40}/i  // Ethereum private keys
];
```

### Step 4: Functional Test

If the project is a web server:
```bash
cd backend && npm start &
sleep 2
curl http://localhost:3000/  # Health check
```

---

## How to Write a Review Report

### Report Template

```markdown
# Code Review Report

**Date:** YYYY-MM-DD
**Reviewer:** [Name/Agent]
**Project:** [Project Path]

---

## Summary

| Check | Status |
|-------|--------|
| Compilation | ✅/❌ |
| Package Scripts | ✅/❌ |
| No Secrets | ✅/❌ |
| Security | ✅/❌ |

---

## Detailed Findings

### 1. [Category Name]

**Status:** ✅ PASS / ⚠️ WARNINGS / ❌ FAIL

[Detailed description with examples]

---

## Recommendations

1. [Priority] [Action item]
2. [Priority] [Action item]

---

## Conclusion

[Overall status and readiness]
```

---

## Example Findings from btc-trading

### Finding 1: Input Validation Gap

**File:** `backend/routes/order.js`  
**Severity:** MEDIUM  
**Issue:** `amount` not validated as positive number

```javascript
// Current code (problematic):
const { type, side, price, amount, exchange } = req.body;
if (!type || !side || !amount) { /* only checks existence */ }

// Recommended fix:
if (typeof amount !== 'number' || amount <= 0) {
  return res.status(400).json({ 
    error: 'amount must be a positive number' 
  });
}
```

### Finding 2: Parameter Allowlisting Missing

**File:** `backend/routes/orderbook.js`  
**Severity:** HIGH  
**Issue:** Exchange parameter not validated

```javascript
// Current code:
const orderbook = generateOrderBook(exchange.toLowerCase());

// Recommended fix:
const validExchanges = ['binance', 'coinbase', 'kraken'];
if (!validExchanges.includes(exchange?.toLowerCase())) {
  return res.status(400).json({ 
    error: 'Invalid exchange',
    allowed: validExchanges
  });
}
```

### Finding 3: Good Practice

**File:** `backend/routes/order.js`  
**Status:** ✅ Proper error handling

```javascript
// Demonstrates good error handling:
if (order.status === 'filled' || order.status === 'cancelled') {
  return res.status(400).json({ 
    error: `Cannot cancel order with status: ${order.status}` 
  });
}
```

### Finding 4: Resource Cleanup

**File:** `data/price-simulator.js`  
**Status:** ✅ Proper cleanup

```javascript
// Demonstrates good resource management:
const interval = setInterval(sendUpdate, 5000);
sendUpdate();

req.on('close', () => {
  clearInterval(interval);  // Prevents memory leaks
});
```

---

## Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| 🔴 HIGH | Security vulnerability or data loss risk | Fix immediately |
| 🟡 MEDIUM | Functional bug or bad practice | Fix before release |
| 🟢 LOW | Code quality or style issue | Fix when convenient |
| ✅ POSITIVE | Good practice found | Document as reference |

---

## Quick Reference Commands

```bash
# Check syntax
node --check file.js

# Validate JSON
cat package.json | python3 -m json.tool > /dev/null && echo "Valid JSON"

# Scan for secrets
grep -rE "(api_key|secret|password|token)" --include="*.js" .

# Count source files
find . -name "*.js" -not -path "./node_modules/*" | wc -l

# Check npm scripts
npm run
```

---

## Common Issues Checklist

- [ ] All source files compile without errors
- [ ] package.json has `start` script
- [ ] package.json has `test` script (if applicable)
- [ ] No hardcoded API keys or secrets
- [ ] All user inputs are validated
- [ ] Error responses have appropriate HTTP status codes
- [ ] Async operations have proper error handling
- [ ] Resources (intervals, connections) are cleaned up
- [ ] No SQL/NoSQL injection vulnerabilities
- [ ] Exchange/asset parameters are allowlisted

---

*Last updated: 2026-05-21*
