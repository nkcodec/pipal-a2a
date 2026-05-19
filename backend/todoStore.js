// In-memory JSON storage with UUID generation

// Simple UUID v4 generator
function generateUUID() {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

// In-memory store
let todos = [];

// Todo Store API
const todoStore = {
  // Get all todos
  getAll() {
    return [...todos];
  },

  // Get single todo by ID
  getById(id) {
    return todos.find(todo => todo.id === id) || null;
  },

  // Create new todo
  create(title) {
    const todo = {
      id: generateUUID(),
      title: title.trim(),
      completed: false,
      createdAt: new Date().toISOString()
    };
    todos.push(todo);
    return { ...todo };
  },

  // Update todo (title and/or completed)
  update(id, updates) {
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      return null;
    }
    
    const todo = todos[index];
    const updatedTodo = {
      ...todo,
      ...(updates.title !== undefined && { title: updates.title }),
      ...(updates.completed !== undefined && { completed: updates.completed })
    };
    todos[index] = updatedTodo;
    return { ...updatedTodo };
  },

  // Delete todo by ID
  delete(id) {
    const index = todos.findIndex(todo => todo.id === id);
    if (index === -1) {
      return false;
    }
    todos.splice(index, 1);
    return true;
  }
};

module.exports = todoStore;
