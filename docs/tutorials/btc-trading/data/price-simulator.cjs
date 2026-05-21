/**
 * Market Data Feed Price Simulator
 * Emits simulated price updates for BTC, ETH, SOL trading pairs via SSE
 */

const pairs = {
  BTC: { basePrice: 67500, volatility: 0.002, minPrice: 60000, maxPrice: 75000 },
  ETH: { basePrice: 3450, volatility: 0.003, minPrice: 3000, maxPrice: 4000 },
  SOL: { basePrice: 145, volatility: 0.004, minPrice: 100, maxPrice: 200 }
};

const prices = {
  BTC: pairs.BTC.basePrice,
  ETH: pairs.ETH.basePrice,
  SOL: pairs.SOL.basePrice
};

/**
 * Simulate random walk price movement with mean reversion
 */
function updatePrice(pair) {
  const config = pairs[pair];
  const drift = (config.basePrice - prices[pair]) * 0.01;
  const randomMove = (Math.random() - 0.5) * 2 * config.volatility * prices[pair];
  
  let newPrice = prices[pair] + randomMove + drift;
  
  newPrice = Math.max(config.minPrice, Math.min(config.maxPrice, newPrice));
  prices[pair] = Math.round(newPrice * 100) / 100;
  
  return prices[pair];
}

/**
 * Generate price update payload
 */
function generatePriceUpdate() {
  const timestamp = Date.now();
  const update = {
    timestamp,
    pairs: {}
  };
  
  for (const pair of Object.keys(pairs)) {
    const price = updatePrice(pair);
    const change24h = ((price - pairs[pair].basePrice) / pairs[pair].basePrice * 100).toFixed(2);
    
    update.pairs[pair] = {
      price,
      change24h: parseFloat(change24h),
      high24h: pairs[pair].maxPrice,
      low24h: pairs[pair].minPrice
    };
  }
  
  return update;
}

/**
 * SSE Stream Handler for Express/Node HTTP server
 */
function createSSEStream(req, res) {
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive',
    'Access-Control-Allow-Origin': '*'
  });
  
  const sendUpdate = () => {
    const update = generatePriceUpdate();
    res.write(`data: ${JSON.stringify(update)}\n\n`);
  };
  
  const interval = setInterval(sendUpdate, 5000);
  sendUpdate();
  
  req.on('close', () => {
    clearInterval(interval);
  });
}

/**
 * Standalone HTTP server for testing
 */
function startStandaloneServer(port = 3001) {
  const http = require('http');
  
  const server = http.createServer((req, res) => {
    if (req.url === '/prices' && req.method === 'GET') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
        'Access-Control-Allow-Origin': '*'
      });
      
      const interval = setInterval(() => {
        const update = generatePriceUpdate();
        res.write(`data: ${JSON.stringify(update)}\n\n`);
      }, 5000);
      
      req.on('close', () => clearInterval(interval));
    } else if (req.url === '/health') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ status: 'ok', prices }));
    } else {
      res.writeHead(404);
      res.end('Not Found');
    }
  });
  
  server.listen(port, () => {
    console.log(`Price simulator running at http://localhost:${port}`);
    console.log(`SSE stream: http://localhost:${port}/prices`);
    console.log(`Health check: http://localhost:${port}/health`);
  });
  
  return server;
}

module.exports = {
  pairs,
  prices,
  updatePrice,
  generatePriceUpdate,
  createSSEStream,
  startStandaloneServer
};

if (require.main === module) {
  startStandaloneServer();
}
