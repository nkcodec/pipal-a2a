const express = require('express');
const router = express.Router();
const { generateOrderBook } = require('../models/mockData');

// GET /orderbook - Get order book data
// Query params: exchange (optional) - binance, coinbase, kraken
router.get('/', (req, res) => {
  const { exchange } = req.query;
  
  if (exchange) {
    const orderbook = generateOrderBook(exchange.toLowerCase());
    return res.json(orderbook);
  }
  
  // Return all exchanges if none specified
  res.json({
    binance: generateOrderBook('binance'),
    coinbase: generateOrderBook('coinbase'),
    kraken: generateOrderBook('kraken')
  });
});

module.exports = router;