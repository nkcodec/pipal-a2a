const express = require('express');
const todoModel = require('../models/todo');

const router = express.Router();

// Validation helper
function validateTodo(data, isCreate = false) {
  const errors = [];
  
  if (isCreate && (!data.title || typeof data.title !== 'string' || data.title.trim() === '')) {
    errors.push('Title is required and must be a non-empty string');
  }
  
  if (data.title !== undefined && typeof data.title !== 'string') {
    errors.push('Title must be a string');
  }
  
  if (data.description !== undefined && typeof data.description !== 'string' && data.description !== null) {
    errors.push('Description must be a string or null');
  }
  
  if (data.completed !== undefined && typeof data.completed !== 'boolean') {
    errors.push('Completed must be a boolean');
  }
  
  return errors;
}

// GET /api/todos - List all todos
router.get('/', (req, res) => {
  try {
    const todos = todoModel.getAll();
    res.json(todos);
  } catch (error) {
    console.error('Error fetching todos:', error);
    res.status(500).json({ error: 'Failed to fetch todos' });
  }
});

// GET /api/todos/:id - Get a single todo
router.get('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }
    
    const todo = todoModel.getById(id);
    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }
    res.json(todo);
  } catch (error) {
    console.error('Error fetching todo:', error);
    res.status(500).json({ error: 'Failed to fetch todo' });
  }
});

// POST /api/todos - Create a new todo
router.post('/', (req, res) => {
  try {
    const errors = validateTodo(req.body, true);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { title, description, completed } = req.body;
    const todo = todoModel.create({
      title: title.trim(),
      description: description?.trim() || null,
      completed: completed || false
    });
    
    res.status(201).json(todo);
  } catch (error) {
    console.error('Error creating todo:', error);
    res.status(500).json({ error: 'Failed to create todo' });
  }
});

// PUT /api/todos/:id - Update a todo
router.put('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const errors = validateTodo(req.body, false);
    if (errors.length > 0) {
      return res.status(400).json({ error: 'Validation failed', details: errors });
    }

    const { title, description, completed } = req.body;
    const todo = todoModel.update(id, {
      title: title?.trim(),
      description: description === null ? null : description?.trim(),
      completed
    });

    if (!todo) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.json(todo);
  } catch (error) {
    console.error('Error updating todo:', error);
    res.status(500).json({ error: 'Failed to update todo' });
  }
});

// DELETE /api/todos/:id - Delete a todo
router.delete('/:id', (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ error: 'Invalid ID format' });
    }

    const deleted = todoModel.delete(id);
    if (!deleted) {
      return res.status(404).json({ error: 'Todo not found' });
    }

    res.status(204).send();
  } catch (error) {
    console.error('Error deleting todo:', error);
    res.status(500).json({ error: 'Failed to delete todo' });
  }
});

module.exports = router;
