import { useState } from 'react'
import { useTodos } from './hooks/useTodos'
import TodoList from './components/TodoList'
import TodoForm from './components/TodoForm'
import FilterTabs from './components/FilterTabs'
import './App.css'

function App() {
  const [filter, setFilter] = useState('all')
  const { todos, loading, error, addTodo, toggleTodo, deleteTodo, fetchTodos } = useTodos()

  const filteredTodos = todos.filter(todo => {
    if (filter === 'active') return !todo.completed
    if (filter === 'completed') return todo.completed
    return true
  })

  const activeCount = todos.filter(todo => !todo.completed).length

  if (loading) {
    return <div className="loading">Loading todos...</div>
  }

  return (
    <div className="app">
      <h1 className="app-title">Todo App</h1>
      
      {error && (
        <div className="error">
          <p>{error}</p>
          <button onClick={fetchTodos}>Retry</button>
        </div>
      )}
      
      <TodoForm onAdd={addTodo} />
      
      <TodoList
        todos={filteredTodos}
        onToggle={toggleTodo}
        onDelete={deleteTodo}
      />
      
      <FilterTabs
        filter={filter}
        onFilterChange={setFilter}
        activeCount={activeCount}
      />
    </div>
  )
}

export default App
