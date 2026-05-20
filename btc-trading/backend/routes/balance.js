const express = require('express');
const router = express.Router();
const Balance = require('../models/balance');

// GET /balance - Get all balances
router.get('/', (req, res) => {
  const { asset } = req.query;
  
  if (asset) {
    return res.json({ 
      asset: asset.toUpperCase(),
      balance: Balance.get(asset.toUpperCase())
    });
  }
  
  const balances = Balance.getAll();
  
  // Add USD value estimate
  const btcValue = balances.BTC * 67450; // rough estimate
  const totalUSD = balances.USD + balances.USDT + btcValue;
  
  res.json({
    balances,
    summary: {
      totalUSD: parseFloat(totalUSD.toFixed(2)),
      btcValue: parseFloat(btcValue.toFixed(2))
    }
  });
});

// POST /balance - Set or reset balance (for testing)
router.post('/', (req, res) => {
  const { asset, amount, reset } = req.body;
  
  if (reset) {
    Balance.reset();
    return res.json({ 
      message: 'Balances reset to defaults',
      balances: Balance.getAll()
    });
  }
  
  if (!asset || amount === undefined) {
    return res.status(400).json({ 
      error: 'Missing required fields: asset, amount' 
    });
  }
  
  Balance.set(asset.toUpperCase(), amount);
  
  res.json({ 
    asset: asset.toUpperCase(),
    balance: Balance.get(asset.toUpperCase())
  });
});

module.exports = router;