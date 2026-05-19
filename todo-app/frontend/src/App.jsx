import { useState } from 'react'
import TodoItem from './components/TodoItem'

function App() {
  const [todos, setTodos] = useState([])
  const [input, setInput] = useState('')

  const addTodo = () => {
    if (input.trim() === '') return
    const newTodo = {
      id: Date.now(),
      text: input.trim(),
      completed: false
    }
    setTodos([...todos, newTodo])
    setInput('')
  }

  const toggleTodo = (id) => {
    setTodos(todos.map(todo => 
      todo.id === id ? { ...todo, completed: !todo.completed } : todo
    ))
  }

  const deleteTodo = (id) => {
    setTodos(todos.filter(todo => todo.id !== id))
  }

  const handleKeyPress = (e) => {
    if (e.key === 'Enter') {
      addTodo()
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 py-8 px-4">
      <div className="max-w-lg mx-auto">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          <h1 className="text-3xl font-bold text-center text-gray-800 mb-8">
            ✨ My Todos
          </h1>
          
          {/* Input Section */}
          <div className="flex gap-3 mb-8">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyPress={handleKeyPress}
              placeholder="Add a new task..."
              className="flex-1 px-4 py-3 rounded-xl border-2 border-gray-200 
                       focus:border-indigo-500 focus:outline-none transition-colors
                       text-gray-700 placeholder-gray-400"
            />
            <button
              onClick={addTodo}
              className="px-6 py-3 bg-indigo-600 text-white font-semibold rounded-xl
                       hover:bg-indigo-700 active:scale-95 transition-all shadow-md
                       hover:shadow-lg"
            >
              Add
            </button>
          </div>

          {/* Todo List */}
          <div className="space-y-3">
            {todos.length === 0 ? (
              <p className="text-center text-gray-400 py-8">
                No todos yet. Add one above! 🚀
              </p>
            ) : (
              todos.map(todo => (
                <TodoItem
                  key={todo.id}
                  todo={todo}
                  onToggle={toggleTodo}
                  onDelete={deleteTodo}
                />
              ))
            )}
          </div>

          {/* Stats */}
          {todos.length > 0 && (
            <div className="mt-8 pt-6 border-t border-gray-100">
              <p className="text-center text-sm text-gray-500">
                {todos.filter(t => t.completed).length} of {todos.length} completed
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

export default App