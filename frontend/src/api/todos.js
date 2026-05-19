import axios from 'axios';

const API_BASE = 'http://localhost:3001/api/todos';

export const getTodos = async () => {
  const response = await axios.get(API_BASE);
  return response.data.data;
};

export const createTodo = async (title) => {
  const response = await axios.post(API_BASE, { title });
  return response.data.data;
};

export const updateTodo = async (id, updates) => {
  const response = await axios.put(`${API_BASE}/${id}`, updates);
  return response.data.data;
};

export const deleteTodo = async (id) => {
  await axios.delete(`${API_BASE}/${id}`);
  return id;
};
