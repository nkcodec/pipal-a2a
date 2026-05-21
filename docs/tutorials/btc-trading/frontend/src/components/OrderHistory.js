import React, { useState, useEffect } from 'react';
import { fetchOrders } from '../hooks/useApi';

export default function OrderHistory({ refreshKey }) {
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadOrders = async () => {
      setLoading(true);
      setError(null);
      
      try {
        const result = await fetchOrders();
        setOrders(result.orders || []);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadOrders();
  }, [refreshKey]);

  if (loading) {
    return (
      <div className="order-history">
        <h2 className="section-title">Order History</h2>
        <div className="loading">Loading orders...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="order-history">
        <h2 className="section-title">Order History</h2>
        <div className="error-message">Unable to load orders: {error}</div>
      </div>
    );
  }

  return (
    <div className="order-history">
      <h2 className="section-title">Order History</h2>
      
      {orders.length === 0 ? (
        <div className="empty-history">No orders yet</div>
      ) : (
        <table className="history-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Time</th>
              <th>Exchange</th>
              <th>Type</th>
              <th>Side</th>
              <th>Amount</th>
              <th>Price</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {orders.map(order => (
              <tr key={order.id}>
                <td>#{order.id}</td>
                <td>{new Date(order.timestamp).toLocaleTimeString()}</td>
                <td>{order.exchange}</td>
                <td>{order.type}</td>
                <td className={`side-badge ${order.side}`}>{order.side.toUpperCase()}</td>
                <td>{order.amount}</td>
                <td>${order.price.toLocaleString()}</td>
                <td>
                  <span className={`status-badge ${order.status}`}>
                    {order.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}