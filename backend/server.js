const express = require('express');
const todoStore = require('./todoStore');

const app = express();
const PORT = 3001;

// Middleware
app.use(express.json());

// Response wrapper
function sendResponse(res, statusCode, data) {
  res.status(statusCode).json({
    success: statusCode < 400,
    data
  });
}

// GET /api/todos - List all todos
app.get('/api/todos', (req, res) => {
  const todos = todoStore.getAll();
  sendResponse(res, 200, todos);
});

// POST /api/todos - Create a new todo
app.post('/api/todos', (req, res) => {
  const { title } = req.body;
  
  if (!title || typeof title !== 'string' || title.trim() === '') {
    return sendResponse(res, 400, { error: 'Title is required' });
  }
  
  const todo = todoStore.create(title);
  sendResponse(res, 201, todo);
});

// PUT /api/todos/:id - Update a todo
app.put('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  const { title, completed } = req.body;
  
  const updates = {};
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim() === '') {
      return sendResponse(res, 400, { error: 'Title cannot be empty' });
    }
    updates.title = title.trim();
  }
  if (completed !== undefined) {
    updates.completed = Boolean(completed);
  }
  
  const todo = todoStore.update(id, updates);
  if (!todo) {
    return sendResponse(res, 404, { error: 'Todo not found' });
  }
  
  sendResponse(res, 200, todo);
});

// DELETE /api/todos/:id - Delete a todo
app.delete('/api/todos/:id', (req, res) => {
  const { id } = req.params;
  
  const deleted = todoStore.delete(id);
  if (!deleted) {
    return sendResponse(res, 404, { error: 'Todo not found' });
  }
  
  sendResponse(res, 200, { message: 'Todo deleted' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Todo backend server running on http://localhost:${PORT}`);
});
