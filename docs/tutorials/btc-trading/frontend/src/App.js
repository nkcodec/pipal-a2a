import React, { useState, useEffect } from 'react';
import Ticker from './components/Ticker';
import OrderForm from './components/OrderForm';
import OrderHistory from './components/OrderHistory';
import './index.css';

const API_BASE = 'http://localhost:3000';

function App() {
  const [connected, setConnected] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    const checkConnection = async () => {
      try {
        const response = await fetch(`${API_BASE}/`);
        const data = await response.json();
        setConnected(data.status === 'ok');
      } catch {
        setConnected(false);
      }
    };

    checkConnection();
    const interval = setInterval(checkConnection, 10000);
    return () => clearInterval(interval);
  }, []);

  const handleOrderComplete = () => {
    setRefreshKey(k => k + 1);
  };

  return (
    <div className="app">
      <header className="header">
        <h1>BTC Trading</h1>
        <div className="connection-status">
          <span className={`status-dot ${connected ? 'connected' : ''}`}></span>
          <span>{connected ? 'Connected' : 'Disconnected'}</span>
        </div>
      </header>

      <Ticker />

      <div className="main-content">
        <OrderForm onOrderComplete={handleOrderComplete} />
        <div className="order-section">
          <h2 className="section-title">Portfolio Balance</h2>
          <div id="balance-placeholder">
            <p style={{ color: '#7070a0', fontSize: '14px' }}>
              Balance info loaded from backend
            </p>
          </div>
        </div>
      </div>

      <OrderHistory refreshKey={refreshKey} />
    </div>
  );
}

export default App;