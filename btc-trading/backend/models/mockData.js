// Mock price data for different exchanges
const mockPrices = {
  binance: {
    symbol: 'BTC/USDT',
    price: 67450.25,
    change24h: 2.34,
    high24h: 68100.00,
    low24h: 66100.00,
    volume24h: 32450.67
  },
  coinbase: {
    symbol: 'BTC/USD',
    price: 67455.00,
    change24h: 2.31,
    high24h: 68105.50,
    low24h: 66105.00,
    volume24h: 12890.34
  },
  kraken: {
    symbol: 'BTC/USD',
    price: 67448.75,
    change24h: 2.29,
    high24h: 68102.00,
    low24h: 66102.50,
    volume24h: 8920.15
  }
};

// Mock orderbook data
const generateOrderBook = (exchange) => {
  const basePrice = mockPrices[exchange]?.price || 67450;
  
  const bids = [];
  const asks = [];
  
  for (let i = 0; i < 10; i++) {
    const bidPrice = basePrice - (i * 5 + Math.random() * 2);
    const askPrice = basePrice + (i * 5 + Math.random() * 2);
    
    bids.push({
      price: parseFloat(bidPrice.toFixed(2)),
      amount: parseFloat((Math.random() * 5 + 0.1).toFixed(4)),
      exchange
    });
    
    asks.push({
      price: parseFloat(askPrice.toFixed(2)),
      amount: parseFloat((Math.random() * 5 + 0.1).toFixed(4)),
      exchange
    });
  }
  
  return { bids, asks, exchange };
};

module.exports = {
  mockPrices,
  generateOrderBook
};