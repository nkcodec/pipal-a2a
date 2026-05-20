# Security Agent

**Purpose:** Performs security audits of codebases to identify vulnerabilities, validates input handling, and produces actionable security reports.

---

## What the Security Agent Does

1. **Analyzes code for common vulnerabilities** - Injection attacks, SSRF, validation gaps
2. **Reviews input handling** - All user-provided data across endpoints
3. **Checks for insecure patterns** - Direct string interpolation, missing validation
4. **Produces educational reports** - Explains findings with vulnerable vs secure code examples

---

## Case Study: BTC Trading Audit

### Target
`btc-trading/backend/` - A mock trading API with routes for orders, balances, tickers, and orderbooks.

### Findings Overview

| Severity | Count | Primary Concerns |
|----------|-------|-----------------|
| 🔴 HIGH | 2 | Unvalidated IDs, missing exchange whitelist |
| 🟡 MEDIUM | 5 | Numeric bounds, asset injection risk, SSRF |
| 🟢 LOW | 5 | Good practices (in-memory storage, allowlists) |

---

## Common Vulnerabilities to Check

### 1. Injection Attacks

Injection occurs when untrusted data is interpreted as code or commands.

#### SQL Injection
```javascript
// ❌ VULNERABLE - Never do this
const userId = req.params.id;
db.query(`SELECT * FROM users WHERE id = ${userId}`);

// ✅ SECURE - Parameterized query
db.query('SELECT * FROM users WHERE id = ?', [userId]);
```

#### NoSQL Injection
```javascript
// ❌ VULNERABLE - Object injection
const query = { asset: req.body.asset };
db.collection.find(query);

// ✅ SECURE - Validate against whitelist
const validAssets = ['USD', 'BTC', 'USDT'];
if (!validAssets.includes(req.body.asset.toUpperCase())) {
  return res.status(400).json({ error: 'Invalid asset' });
}
```

#### Command Injection
```javascript
// ❌ VULNERABLE - Shell injection
const filename = req.body.filename;
exec(`cat ${filename}`);

// ✅ SECURE - Validate input strictly
const validNames = /^[a-zA-Z0-9_-]+$/;
if (!validNames.test(filename)) {
  return res.status(400).json({ error: 'Invalid filename' });
}
```

### 2. Server-Side Request Forgery (SSRF)

SSRF occurs when user input controls URL construction for backend requests.

```javascript
// ❌ VULNERABLE - User controls the URL
const exchange = req.query.exchange;
const url = `https://${exchange}-api.example.com/prices`;
fetch(url);

// ✅ SECURE - Whitelist allowed values
const EXCHANGES = ['binance', 'coinbase', 'kraken'];
if (!EXCHANGES.includes(exchange)) {
  return res.status(400).json({ error: 'Invalid exchange' });
}
const url = `${BASE_URL}/${exchange}/prices`; // Predefined base
```

#### SSRF Checklist
- [ ] Is user input used to construct URLs?
- [ ] Are there URL validation/scheme checks?
- [ ] Are there IP range restrictions?
- [ ] Is there a DNS rebinding protection?

### 3. Input Validation Gaps

#### Numeric Validation
```javascript
// ❌ VULNERABLE - Missing validation
const amount = req.body.amount;
Balance.update('BTC', -amount);

// ✅ SECURE - Explicit type and range check
const amount = parseFloat(req.body.amount);
if (isNaN(amount) || !isFinite(amount) || amount <= 0) {
  return res.status(400).json({ error: 'Invalid amount' });
}
```

#### String Length & Content
```javascript
// ❌ VULNERABLE - No bounds
const input = req.body.data;
doSomething(input);

// ✅ SECURE - Length and content validation
const MAX_LENGTH = 255;
const validPattern = /^[a-zA-Z0-9_-]+$/;
if (!validPattern.test(input) || input.length > MAX_LENGTH) {
  return res.status(400).json({ error: 'Invalid input' });
}
```

#### ID Parameter Validation
```javascript
// ❌ VULNERABLE - Blind parsing
const id = parseInt(req.params.id);
Order.findById(id);

// ✅ SECURE - Explicit validation
const id = parseInt(req.params.id);
if (!Number.isInteger(id) || id < 1) {
  return res.status(400).json({ error: 'Invalid ID' });
}
```

---

## Vulnerable vs Secure Pattern Reference

### Parameter Handling

| Scenario | Vulnerable | Secure |
|----------|-----------|--------|
| String parameter | Direct use | Whitelist validation |
| Numeric parameter | No check | Type + range validation |
| ID parameter | parseInt only | isInteger + min check |
| URL construction | String interpolation | Whitelist + base URL |
| Database query | Template literal | Parameterized query |

### Real Examples from BTC Trading Audit

#### Finding: Unvalidated Order ID
```javascript
// ❌ BEFORE (Vulnerable)
router.delete('/:id', (req, res) => {
  const order = Order.findById(parseInt(req.params.id));
  // parseInt("abc") → NaN, NaN comparisons always fail
});

// ✅ AFTER (Secure)
router.delete('/:id', (req, res) => {
  const id = parseInt(req.params.id);
  if (!Number.isInteger(id) || id < 1) {
    return res.status(400).json({ error: 'Invalid order ID' });
  }
  const order = Order.findById(id);
});
```

#### Finding: Missing Numeric Bounds
```javascript
// ❌ BEFORE (Vulnerable)
const { amount, price } = req.body;
// No validation - negative/zero/Infinity possible

// ✅ AFTER (Secure)
if (typeof amount !== 'number' || amount <= 0 || !isFinite(amount)) {
  return res.status(400).json({ error: 'amount must be positive' });
}
if (price !== undefined && (typeof price !== 'number' || price <= 0)) {
  return res.status(400).json({ error: 'price must be positive' });
}
```

#### Finding: Exchange Parameter SSRF Risk
```javascript
// ❌ BEFORE (Vulnerable)
router.get('/', (req, res) => {
  const { exchange } = req.query;
  // No validation - could be used to call arbitrary URLs in production
  const orderbook = generateOrderBook(exchange.toLowerCase());
});

// ✅ AFTER (Secure)
const VALID_EXCHANGES = ['binance', 'coinbase', 'kraken'];
router.get('/', (req, res) => {
  const { exchange } = req.query;
  if (exchange && !VALID_EXCHANGES.includes(exchange.toLowerCase())) {
    return res.status(400).json({
      error: 'Invalid exchange',
      allowed: VALID_EXCHANGES
    });
  }
  const orderbook = generateOrderBook(exchange.toLowerCase());
});
```

---

## How to Write a Security Report

### Structure

```
1. Header
   - Title, Date, Scope, Target

2. Executive Summary
   - Overall risk assessment
   - Number of findings by severity

3. Findings (by severity)
   - ID and severity
   - File location and line numbers
   - Description of vulnerability
   - Code example (vulnerable)
   - Recommendation (fixed code)

4. Positive Findings
   - Good security practices observed

5. Summary Table
   - ID | Severity | Category | Issue | Status

6. Recommended Actions
   - Prioritized by urgency
```

### Severity Levels

| Level | Description | Action |
|-------|-------------|--------|
| 🔴 CRITICAL | Remote code execution, data breach | Immediate fix |
| 🔴 HIGH | Injection, authentication bypass | Fix within 24h |
| 🟡 MEDIUM | Information disclosure, validation gaps | Fix within week |
| 🟢 LOW | Code smell, minor issues | Fix in next sprint |
| ✅ INFO | Good practices observed | Maintain |

### Report Example

```markdown
# Security Audit Report: [Project Name]

**Date:** 2026-05-21
**Scope:** API endpoints and data handling
**Target:** `src/api/`

---

## Executive Summary

Found **7 issues** requiring attention:
- 2 HIGH severity
- 4 MEDIUM severity
- 1 LOW severity

---

## Findings

### 🔴 HIGH - [Title]

**File:** `src/routes/users.js:42`

**Description:**
Explain what the vulnerability is and why it matters.

```javascript
// Vulnerable code
```

**Recommendation:**
```javascript
// Fixed code
```

---

## Summary Table

| ID | Severity | Category | Issue | Status |
|----|----------|----------|-------|--------|
| 1 | HIGH | Injection | Unvalidated user input | Should Fix |
| 2 | MEDIUM | SSRF | Missing URL validation | Should Fix |

---

## Recommended Actions

1. **Immediate:** Fix HIGH severity items
2. **This week:** Address MEDIUM items
3. **Next sprint:** Handle LOW items
```

---

## Checklist for Security Audits

### Before Starting
- [ ] Identify all entry points (routes, APIs, webhooks)
- [ ] Map data flow (input → processing → storage)
- [ ] Note authentication/authorization mechanisms

### Input Validation
- [ ] Check all request parameters (path, query, body, headers)
- [ ] Validate types (string, number, boolean, array, object)
- [ ] Validate ranges (min/max, length, regex)
- [ ] Validate against allowlists (not denylists)

### Injection Attacks
- [ ] SQL/NoSQL queries - parameterized?
- [ ] Shell commands - strict validation?
- [ ] File paths - path traversal protected?
- [ ] HTML/JS output - sanitized?

### SSRF
- [ ] URLs constructed from user input?
- [ ] Scheme allowedlist (http/https only)?
- [ ] IP range restrictions?
- [ ] DNS rebinding protection?

### Authentication
- [ ] Session management secure?
- [ ] Passwords hashed properly?
- [ ] Tokens properly validated?

### Error Handling
- [ ] No stack traces exposed?
- [ ] Errors logged server-side?
- [ ] User-friendly error messages?

---

## Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [CWE Common Weakness Enumeration](https://cwe.mitre.org/)
- [Node.js Security Best Practices](https://nodejs.org/en/security/)

---

*This document serves as educational reference for security auditing practices.*
