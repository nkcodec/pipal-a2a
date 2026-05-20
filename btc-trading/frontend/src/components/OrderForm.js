import React, { useState } from 'react';
import { postOrder } from '../hooks/useApi';

const CRYPTO_OPTIONS = [
  { value: 'BTC', label: 'Bitcoin (BTC)' },
  { value: 'ETH', label: 'Ethereum (ETH)' },
  { value: 'SOL', label: 'Solana (SOL)' }
];

const EXCHANGE_OPTIONS = [
  { value: 'binance', label: 'Binance' },
  { value: 'coinbase', label: 'Coinbase' },
  { value: 'kraken', label: 'Kraken' }
];

export default function OrderForm({ onOrderComplete }) {
  const [side, setSide] = useState('buy');
  const [type, setType] = useState('market');
  const [amount, setAmount] = useState('');
  const [price, setPrice] = useState('');
  const [exchange, setExchange] = useState('binance');
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage(null);
    setLoading(true);

    try {
      const orderData = {
        type,
        side,
        amount: parseFloat(amount),
        exchange
      };

      if (type === 'limit') {
        orderData.price = parseFloat(price);
      }

      const result = await postOrder(orderData);
      
      setMessage({
        type: 'success',
        text: `${side.toUpperCase()} order for ${amount} ${orderData.asset || 'BTC'} placed successfully!`
      });

      setAmount('');
      setPrice('');

      if (onOrderComplete) {
        onOrderComplete(result);
      }
    } catch (err) {
      setMessage({
        type: 'error',
        text: err.message
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="order-section">
      <h2 className="section-title">Place Order</h2>
      
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="form-group">
          <label>Order Type</label>
          <select value={type} onChange={(e) => setType(e.target.value)}>
            <option value="market">Market</option>
            <option value="limit">Limit</option>
          </select>
        </div>

        <div className="form-group">
          <label>Exchange</label>
          <select value={exchange} onChange={(e) => setExchange(e.target.value)}>
            {EXCHANGE_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>
        </div>

        <div className="side-buttons">
          <button
            type="button"
            className={`side-btn buy ${side === 'buy' ? 'active' : ''}`}
            onClick={() => setSide('buy')}
          >
            BUY
          </button>
          <button
            type="button"
            className={`side-btn sell ${side === 'sell' ? 'active' : ''}`}
            onClick={() => setSide('sell')}
          >
            SELL
          </button>
        </div>

        <div className="form-group">
          <label>Amount</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            placeholder="0.00"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            required
          />
        </div>

        {type === 'limit' && (
          <div className="form-group">
            <label>Price (USD)</label>
            <input
              type="number"
              step="0.01"
              min="0"
              placeholder="0.00"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              required
            />
          </div>
        )}

        <button
          type="submit"
          className={`submit-btn ${side}`}
          disabled={loading || !amount}
        >
          {loading ? 'Processing...' : `${side.toUpperCase()} ${amount || '0'} BTC`}
        </button>

        {message && (
          <div className={`${message.type}-message`}>
            {message.text}
          </div>
        )}
      </form>
    </div>
  );
}