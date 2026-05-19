import { useState, useEffect } from 'react';
import TodoList from './components/TodoList.jsx';
import TodoForm from './components/TodoForm.jsx';
import { getTodos, createTodo, updateTodo, deleteTodo } from './api/todos.js';

function App() {
  const [todos, setTodos] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchTodos();
  }, []);

  const fetchTodos = async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await getTodos();
      setTodos(data);
    } catch (err) {
      setError('Failed to load todos. Make sure the server is running.');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddTodo = async (title) => {
    try {
      const newTodo = await createTodo(title);
      setTodos((prev) => [...prev, newTodo]);
    } catch (err) {
      setError('Failed to add todo');
      console.error(err);
    }
  };

  const handleToggleTodo = async (id) => {
    const todo = todos.find((t) => t.id === id);
    if (!todo) return;

    // Optimistic update
    setTodos((prev) =>
      prev.map((t) => (t.id === id ? { ...t, completed: !t.completed } : t))
    );

    try {
      await updateTodo(id, { completed: !todo.completed });
    } catch (err) {
      // Revert on error
      setTodos((prev) =>
        prev.map((t) => (t.id === id ? { ...t, completed: todo.completed } : t))
      );
      setError('Failed to update todo');
      console.error(err);
    }
  };

  const handleDeleteTodo = async (id) => {
    const previousTodos = [...todos];

    // Optimistic update
    setTodos((prev) => prev.filter((t) => t.id !== id));

    try {
      await deleteTodo(id);
    } catch (err) {
      // Revert on error
      setTodos(previousTodos);
      setError('Failed to delete todo');
      console.error(err);
    }
  };

  const completedCount = todos.filter((t) => t.completed).length;
  const incompleteCount = todos.length - completedCount;

  return (
    <div className="app">
      <header className="app-header">
        <h1>Todo App</h1>
      </header>

      <main className="app-main">
        {error && <div className="error-message">{error}</div>}

        <TodoForm onAdd={handleAddTodo} />

        {loading ? (
          <div className="loading">Loading todos...</div>
        ) : (
          <>
            <TodoList
              todos={todos}
              onToggle={handleToggleTodo}
              onDelete={handleDeleteTodo}
            />

            <div className="todo-stats">
              <span className="stat completed">
                {completedCount} completed
              </span>
              <span className="stat incomplete">
                {incompleteCount} remaining
              </span>
            </div>
          </>
        )}
      </main>
    </div>
  );
}

export default App;