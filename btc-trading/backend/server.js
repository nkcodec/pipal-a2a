const express = require('express');
const app = express();

app.use(express.json());

// Import routes
const tickerRoutes = require('./routes/ticker');
const orderbookRoutes = require('./routes/orderbook');
const orderRoutes = require('./routes/order');
const balanceRoutes = require('./routes/balance');

// Mount routes
app.use('/ticker', tickerRoutes);
app.use('/orderbook', orderbookRoutes);
app.use('/order', orderRoutes);
app.use('/balance', balanceRoutes);

// Health check
app.get('/', (req, res) => {
  res.json({ status: 'ok', service: 'BTC Trading API' });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`BTC Trading API running on port ${PORT}`);
});