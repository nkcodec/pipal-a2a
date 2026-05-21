const express = require('express');
const router = express.Router();
const Order = require('../models/order');
const Balance = require('../models/balance');
const { mockPrices } = require('../models/mockData');

// GET /order - List all orders
router.get('/', (req, res) => {
  const { exchange, status } = req.query;
  
  let orders = Order.findAll();
  
  if (exchange) {
    orders = Order.findByExchange(exchange.toLowerCase());
  }
  
  if (status) {
    orders = orders.filter(o => o.status === status);
  }
  
  res.json({ orders, count: orders.length });
});

// POST /order - Create a new order
router.post('/', (req, res) => {
  const { type, side, price, amount, exchange } = req.body;
  
  // Validation
  if (!type || !side || !amount) {
    return res.status(400).json({ 
      error: 'Missing required fields: type, side, amount' 
    });
  }
  
  if (!['limit', 'market'].includes(type)) {
    return res.status(400).json({ 
      error: 'type must be "limit" or "market"' 
    });
  }
  
  if (!['buy', 'sell'].includes(side)) {
    return res.status(400).json({ 
      error: 'side must be "buy" or "sell"' 
    });
  }
  
  if (!['binance', 'coinbase', 'kraken'].includes(exchange?.toLowerCase())) {
    return res.status(400).json({ 
      error: 'exchange must be "binance", "coinbase", or "kraken"' 
    });
  }
  
  if (type === 'limit' && !price) {
    return res.status(400).json({ 
      error: 'limit orders require a price' 
    });
  }
  
  // Get current price
  const currentPrice = mockPrices[exchange.toLowerCase()].price;
  const executionPrice = price || currentPrice;
  
  // Check balance
  if (side === 'buy') {
    const required = executionPrice * amount;
    if (Balance.get('USD') < required) {
      return res.status(400).json({ 
        error: 'Insufficient USD balance',
        required,
        available: Balance.get('USD')
      });
    }
  } else {
    if (Balance.get('BTC') < amount) {
      return res.status(400).json({ 
        error: 'Insufficient BTC balance',
        required: amount,
        available: Balance.get('BTC')
      });
    }
  }
  
  // Create order
  const order = Order.create({
    type,
    side,
    price: executionPrice,
    amount,
    exchange: exchange.toLowerCase()
  });
  
  // Execute immediately for demo (market orders and some limit orders)
  if (type === 'market') {
    // Execute market order
    if (side === 'buy') {
      Balance.update('USD', -executionPrice * amount);
      Balance.update('BTC', amount);
    } else {
      Balance.update('BTC', -amount);
      Balance.update('USD', executionPrice * amount);
    }
    Order.updateStatus(order.id, 'filled');
    order.status = 'filled';
  } else {
    Order.updateStatus(order.id, 'open');
    order.status = 'open';
  }
  
  res.status(201).json({ order });
});

// DELETE /order/:id - Cancel an order
router.delete('/:id', (req, res) => {
  const order = Order.findById(parseInt(req.params.id));
  
  if (!order) {
    return res.status(404).json({ error: 'Order not found' });
  }
  
  if (order.status === 'filled' || order.status === 'cancelled') {
    return res.status(400).json({ 
      error: `Cannot cancel order with status: ${order.status}` 
    });
  }
  
  Order.updateStatus(order.id, 'cancelled');
  order.status = 'cancelled';
  
  res.json({ order, message: 'Order cancelled' });
});

module.exports = router;