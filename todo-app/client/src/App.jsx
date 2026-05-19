import { useState, useEffect } from 'react'

const API_BASE = 'http://localhost:3001/api/todos'

function App() {
  const [todos, setTodos] = useState([])
  const [newTodo, setNewTodo] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    fetchTodos()
  }, [])

  async function fetchTodos() {
    try {
      setLoading(true)
      setError(null)
      const res = await fetch(API_BASE)
      if (!res.ok) throw new Error('Failed to fetch todos')
      const data = await res.json()
      setTodos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  async function addTodo(e) {
    e.preventDefault()
    if (!newTodo.trim()) return

    try {
      setError(null)
      const res = await fetch(API_BASE, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title: newTodo.trim() })
      })
      if (!res.ok) throw new Error('Failed to add todo')
      const todo = await res.json()
      setTodos(prev => [...prev, todo])
      setNewTodo('')
    } catch (err) {
      setError(err.message)
    }
  }

  async function toggleTodo(id, completed) {
    try {
      setError(null)
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ completed })
      })
      if (!res.ok) throw new Error('Failed to update todo')
      const updated = await res.json()
      setTodos(prev => prev.map(t => t.id === id ? updated : t))
    } catch (err) {
      setError(err.message)
    }
  }

  async function deleteTodo(id) {
    try {
      setError(null)
      const res = await fetch(`${API_BASE}/${id}`, {
        method: 'DELETE'
      })
      if (!res.ok) throw new Error('Failed to delete todo')
      setTodos(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="app">
      <h1>Todo App</h1>
      
      <form className="todo-form" onSubmit={addTodo}>
        <input
          type="text"
          placeholder="Add a new todo..."
          value={newTodo}
          onChange={e => setNewTodo(e.target.value)}
        />
        <button type="submit">Add</button>
      </form>

      {error && <div className="error">{error}</div>}

      {loading ? (
        <div className="loading">
          <div className="spinner"></div>
          <p>Loading...</p>
        </div>
      ) : (
        <ul className="todo-list">
          {todos.length === 0 ? (
            <li className="empty">No todos yet. Add one above!</li>
          ) : (
            todos.map(todo => (
              <li key={todo.id} className={`todo-item ${todo.completed ? 'completed' : ''}`}>
                <label>
                  <input
                    type="checkbox"
                    checked={todo.completed}
                    onChange={e => toggleTodo(todo.id, e.target.checked)}
                  />
                  <span className="todo-title">{todo.title}</span>
                </label>
                <button 
                  className="delete-btn"
                  onClick={() => deleteTodo(todo.id)}
                  aria-label="Delete todo"
                >
                  ×
                </button>
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  )
}

export default App
