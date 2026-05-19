const express = require('express');
const cors = require('cors');
const Database = require('better-sqlite3');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.join(__dirname, 'todos.db');

// Middleware
app.use(cors());
app.use(express.json());

// Initialize SQLite database
const db = new Database(DB_PATH);

// Create todos table
db.exec(`
  CREATE TABLE IF NOT EXISTS todos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    completed INTEGER DEFAULT 0,
    createdAt TEXT NOT NULL
  )
`);

// Simple token-based authentication middleware
const AUTH_TOKEN = process.env.AUTH_TOKEN || 'dev-token-12345';

const authMiddleware = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  
  if (!token || token !== AUTH_TOKEN) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  next();
};

// Make auth optional - attach user info if token present
const optionalAuth = (req, res, next) => {
  const token = req.headers['authorization']?.replace('Bearer ', '');
  req.authenticated = token === AUTH_TOKEN;
  next();
};

app.use(optionalAuth);

// REST API Endpoints

// GET /todos - List all todos
app.get('/todos', authMiddleware, (req, res) => {
  try {
    const todos = db.prepare('SELECT * FROM todos ORDER BY createdAt DESC').all();
    // Convert completed from integer to boolean
    const formattedTodos = todos.map(t => ({
      ...t,
      completed: Boolean(t.completed)
    }));
    res.json(formattedTodos);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// POST /todos - Create a new todo
app.post('/todos', authMiddleware, (req, res) => {
  try {
    const { title, completed = false } = req.body;
    
    if (!title || typeof title !== 'string' || title.trim() === '') {
      return res.status(400).json({ error: 'Title is required and must be a non-empty string' });
    }
    
    const id = uuidv4();
    const createdAt = new Date().toISOString();
    
    const stmt = db.prepare('INSERT INTO todos (id, title, completed, createdAt) VALUES (?, ?, ?, ?)');
    stmt.run(id, title.trim(), completed ? 1 : 0, createdAt);
    
    res.status(201).json({
      id,
      title: title.trim(),
      completed: Boolean(completed),
      createdAt
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// PUT /todos/:id - Update a todo
app.put('/todos/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    const { title, completed } = req.body;
    
    // Check if todo exists
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    
    const updates = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || title.trim() === '') {
        return res.status(400).json({ error: 'Title must be a non-empty string' });
      }
      updates.title = title.trim();
    }
    if (completed !== undefined) {
      updates.completed = completed ? 1 : 0;
    }
    
    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No valid fields to update' });
    }
    
    const stmt = db.prepare('UPDATE todos SET title = ?, completed = ? WHERE id = ?');
    stmt.run(
      updates.title ?? existing.title,
      updates.completed ?? existing.completed,
      id
    );
    
    const updated = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    res.json({
      ...updated,
      completed: Boolean(updated.completed)
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE /todos/:id - Delete a todo
app.delete('/todos/:id', authMiddleware, (req, res) => {
  try {
    const { id } = req.params;
    
    const existing = db.prepare('SELECT * FROM todos WHERE id = ?').get(id);
    if (!existing) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    
    db.prepare('DELETE FROM todos WHERE id = ?').run(id);
    res.json({ message: 'Todo deleted successfully', id });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
app.listen(PORT, () => {
  console.log(`Todo API server running on http://localhost:${PORT}`);
  console.log(`Authentication: Bearer token required`);
  console.log(`Default token: ${AUTH_TOKEN}`);
});

module.exports = app;