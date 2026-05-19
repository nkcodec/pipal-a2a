const express = require('express');
const cors = require('cors');

const app = express();
const PORT = 3001;

// ── Middleware ──────────────────────────────────────────────
app.use(cors({ origin: 'http://localhost:3000' }));
app.use(express.json());

// ── Helpers ────────────────────────────────────────────────
const OPERATIONS = {
  add:      (a, b) => a + b,
  subtract: (a, b) => a - b,
  multiply: (a, b) => a * b,
  divide:   (a, b) => {
    if (b === 0) throw new Error('Division by zero is not allowed');
    return a / b;
  },
};

// ── Routes ─────────────────────────────────────────────────
app.post('/api/calculate', (req, res) => {
  const { operand1, operand2, operation } = req.body;

  // Validate required fields
  if (operand1 === undefined || operand2 === undefined || !operation) {
    return res.status(400).json({
      error: 'Missing required fields: operand1, operand2, operation',
    });
  }

  // Validate numeric operands
  if (typeof operand1 !== 'number' || typeof operand2 !== 'number') {
    return res.status(400).json({
      error: 'operand1 and operand2 must be numbers',
    });
  }

  // Validate operation
  if (!(operation in OPERATIONS)) {
    return res.status(400).json({
      error: `Invalid operation "${operation}". Supported: ${Object.keys(OPERATIONS).join(', ')}`,
    });
  }

  // Execute calculation
  try {
    const result = OPERATIONS[operation](operand1, operand2);
    return res.json({ result });
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
});

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok' });
});

// ── 404 fallback ───────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// ── Global error handler ───────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// ── Start server ───────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`Calculator backend running on http://localhost:${PORT}`);
});
