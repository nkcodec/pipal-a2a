import { useState, useEffect, useCallback } from 'react'

const API_BASE_URL = 'http://localhost:3001/api'

export function useTodos() {
  const [todos, setTodos] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  const fetchTodos = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const response = await fetch(`${API_BASE_URL}/todos`)
      if (!response.ok) {
        throw new Error(`Failed to fetch todos: ${response.status}`)
      }
      const data = await response.json()
      setTodos(data)
    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchTodos()
  }, [fetchTodos])

  const addTodo = useCallback(async (title) => {
    if (!title.trim()) return
    
    try {
      const response = await fetch(`${API_BASE_URL}/todos`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ title, completed: false }),
      })
      
      if (!response.ok) {
        throw new Error(`Failed to add todo: ${response.status}`)
      }
      
      const newTodo = await response.json()
      setTodos(prev => [...prev, newTodo])
    } catch (err) {
      setError(err.message)
    }
  }, [])

  const toggleTodo = useCallback(async (id) => {
    const todo = todos.find(t => t.id === id)
    if (!todo) return

    try {
      const response = await fetch(`${API_BASE_URL}/todos/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ completed: !todo.completed }),
      })
      
      if (!response.ok) {
        throw new Error(`Failed to update todo: ${response.status}`)
      }
      
      const updatedTodo = await response.json()
      setTodos(prev => prev.map(t => t.id === id ? updatedTodo : t))
    } catch (err) {
      setError(err.message)
    }
  }, [todos])

  const deleteTodo = useCallback(async (id) => {
    try {
      const response = await fetch(`${API_BASE_URL}/todos/${id}`, {
        method: 'DELETE',
      })
      
      if (!response.ok) {
        throw new Error(`Failed to delete todo: ${response.status}`)
      }
      
      setTodos(prev => prev.filter(t => t.id !== id))
    } catch (err) {
      setError(err.message)
    }
  }, [])

  return {
    todos,
    loading,
    error,
    addTodo,
    toggleTodo,
    deleteTodo,
    fetchTodos,
  }
}
