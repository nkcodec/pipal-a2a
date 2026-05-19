const express = require('express');
const cors = require('cors');
const { initializeDatabase } = require('./db');
const todosRouter = require('./routes/todos');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/todos', todosRouter);

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Initialize and start server
initializeDatabase();

app.listen(PORT, () => {
  console.log(`
╔═══════════════════════════════════════════╗
║       🚀 Todo App Backend Started         ║
╠═══════════════════════════════════════════╣
║  Server running at:                       ║
║  → http://localhost:${PORT}                  ║
║                                           ║
║  API Endpoints:                           ║
║  → GET    /api/todos                      ║
║  → GET    /api/todos/:id                  ║
║  → POST   /api/todos                      ║
║  → PUT    /api/todos/:id                  ║
║  → DELETE /api/todos/:id                  ║
║  → GET    /api/health                     ║
╚═══════════════════════════════════════════╝
  `);
});

module.exports = app;
