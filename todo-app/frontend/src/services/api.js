const API_BASE = 'http://localhost:4000';
const AUTH_TOKEN = 'dev-token-12345';

const headers = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`
};

export const api = {
  async getTodos() {
    const res = await fetch(`${API_BASE}/todos`, { headers });
    if (!res.ok) throw new Error('Failed to fetch todos');
    return res.json();
  },

  async createTodo(title) {
    const res = await fetch(`${API_BASE}/todos`, {
      method: 'POST',
      headers,
      body: JSON.stringify({ title, completed: false })
    });
    if (!res.ok) throw new Error('Failed to create todo');
    return res.json();
  },

  async updateTodo(id, updates) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
      method: 'PUT',
      headers,
      body: JSON.stringify(updates)
    });
    if (!res.ok) throw new Error('Failed to update todo');
    return res.json();
  },

  async deleteTodo(id) {
    const res = await fetch(`${API_BASE}/todos/${id}`, {
      method: 'DELETE',
      headers
    });
    if (!res.ok) throw new Error('Failed to delete todo');
    return res.json();
  }
};