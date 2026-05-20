import React, { useState, useEffect } from 'react';

const API_BASE = 'http://localhost:3000';

export default function Ticker() {
  const [prices, setPrices] = useState({
    binance: null,
    coinbase: null,
    kraken: null
  });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let mounted = true;

    const fetchPrices = async () => {
      try {
        const response = await fetch(`${API_BASE}/ticker`);
        const data = await response.json();
        
        if (mounted) {
          setPrices({
            binance: data.binance,
            coinbase: data.coinbase,
            kraken: data.kraken
          });
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(err.message);
          setLoading(false);
        }
      }
    };

    fetchPrices();
    const interval = setInterval(fetchPrices, 5000);

    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  if (loading) {
    return (
      <div className="ticker-section">
        <h2 className="section-title">Live Price Ticker</h2>
        <div className="loading">Loading prices...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="ticker-section">
        <h2 className="section-title">Live Price Ticker</h2>
        <div className="error-message">Unable to connect to price feed</div>
      </div>
    );
  }

  const exchanges = ['binance', 'coinbase', 'kraken'];

  return (
    <div className="ticker-section">
      <h2 className="section-title">Live Price Ticker</h2>
      <div className="ticker-grid">
        {exchanges.map(exchange => {
          const ticker = prices[exchange];
          const isPositive = ticker.change24h >= 0;

          return (
            <div key={exchange} className={`ticker-card ${exchange}`}>
              <h3>{exchange.toUpperCase()}</h3>
              <div className={`price ${isPositive ? 'up' : 'down'}`}>
                ${ticker.price.toLocaleString()}
              </div>
              <div className={`change ${isPositive ? 'positive' : 'negative'}`}>
                {isPositive ? '+' : ''}{ticker.change24h.toFixed(2)}%
              </div>
              <div className="details">
                <div>H: ${ticker.high24h.toLocaleString()}</div>
                <div>L: ${ticker.low24h.toLocaleString()}</div>
                <div>Vol: {ticker.volume24h.toFixed(2)} BTC</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}