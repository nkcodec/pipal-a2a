const { db } = require('../db');

const todoModel = {
  getAll() {
    const stmt = db.prepare('SELECT * FROM todos ORDER BY createdAt DESC');
    return stmt.all().map(this.mapRow);
  },

  getById(id) {
    const stmt = db.prepare('SELECT * FROM todos WHERE id = ?');
    const row = stmt.get(id);
    return row ? this.mapRow(row) : null;
  },

  create({ title, description = null, completed = false }) {
    const stmt = db.prepare(`
      INSERT INTO todos (title, description, completed)
      VALUES (?, ?, ?)
    `);
    const result = stmt.run(title, description, completed ? 1 : 0);
    return this.getById(result.lastInsertRowid);
  },

  update(id, { title, description, completed }) {
    const existing = this.getById(id);
    if (!existing) return null;

    const updates = [];
    const values = [];

    if (title !== undefined) {
      updates.push('title = ?');
      values.push(title);
    }
    if (description !== undefined) {
      updates.push('description = ?');
      values.push(description);
    }
    if (completed !== undefined) {
      updates.push('completed = ?');
      values.push(completed ? 1 : 0);
    }

    if (updates.length === 0) return existing;

    updates.push("updatedAt = datetime('now')");
    values.push(id);

    const stmt = db.prepare(`
      UPDATE todos SET ${updates.join(', ')} WHERE id = ?
    `);
    stmt.run(...values);
    return this.getById(id);
  },

  delete(id) {
    const stmt = db.prepare('DELETE FROM todos WHERE id = ?');
    const result = stmt.run(id);
    return result.changes > 0;
  },

  mapRow(row) {
    return {
      ...row,
      completed: Boolean(row.completed)
    };
  }
};

module.exports = todoModel;
