import TodoItem from './TodoItem'
import './TodoList.css'

function TodoList({ todos, onToggle, onDelete }) {
  if (todos.length === 0) {
    return <p className="empty-message">No todos yet. Add one above!</p>
  }

  return (
    <ul className="todo-list">
      {todos.map(todo => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  )
}

export default TodoList
