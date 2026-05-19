const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, '..', 'todo.db');
const db = new Database(dbPath);

// Enable foreign keys
db.pragma('journal_mode = WAL');

function initializeDatabase() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS todos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      description TEXT,
      completed INTEGER DEFAULT 0,
      createdAt TEXT DEFAULT (datetime('now')),
      updatedAt TEXT DEFAULT (datetime('now'))
    )
  `);
  console.log('📦 Database initialized successfully');
}

module.exports = { db, initializeDatabase };
