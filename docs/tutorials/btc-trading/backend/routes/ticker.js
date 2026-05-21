const express = require('express');
const router = express.Router();
const { mockPrices } = require('../models/mockData');

// GET /ticker - Get BTC price ticker
// Query params: exchange (optional) - binance, coinbase, kraken
router.get('/', (req, res) => {
  const { exchange } = req.query;
  
  if (exchange) {
    const data = mockPrices[exchange.toLowerCase()];
    if (!data) {
      return res.status(400).json({ 
        error: 'Invalid exchange',
        available: ['binance', 'coinbase', 'kraken'] 
      });
    }
    return res.json({ ...data, exchange });
  }
  
  // Return aggregated view if no exchange specified
  const aggregated = {
    binance: mockPrices.binance,
    coinbase: mockPrices.coinbase,
    kraken: mockPrices.kraken,
    aggregated: {
      avgPrice: parseFloat((
        (mockPrices.binance.price + mockPrices.coinbase.price + mockPrices.kraken.price) / 3
      ).toFixed(2)),
      bestBid: Math.max(mockPrices.binance.price, mockPrices.coinbase.price, mockPrices.kraken.price),
      bestAsk: Math.min(mockPrices.binance.price, mockPrices.coinbase.price, mockPrices.kraken.price)
    }
  };
  
  res.json(aggregated);
});

module.exports = router;