import { useState, useEffect, useCallback } from 'react';

const API_BASE = 'http://localhost:3000';

export function useApi(endpoint, options = {}) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    if (!endpoint) return;
    
    setLoading(true);
    setError(null);
    
    try {
      const response = await fetch(`${API_BASE}${endpoint}`, options);
      const result = await response.json();
      
      if (!response.ok) {
        throw new Error(result.error || 'API request failed');
      }
      
      setData(result);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [endpoint, JSON.stringify(options)]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return { data, loading, error, refetch: fetchData };
}

export async function postOrder(orderData) {
  const response = await fetch(`${API_BASE}/order`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(orderData)
  });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}

export async function fetchOrders() {
  const response = await fetch(`${API_BASE}/order`);
  const result = await response.json();
  if (!response.ok) throw new Error(result.error);
  return result;
}