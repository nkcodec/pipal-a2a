import './TodoItem.css'

function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <li className="todo-item">
      <label className="todo-label">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={() => onToggle(todo.id)}
          className="todo-checkbox"
        />
        <span className={`todo-text ${todo.completed ? 'completed' : ''}`}>
          {todo.title}
        </span>
      </label>
      <button
        className="delete-button"
        onClick={() => onDelete(todo.id)}
        aria-label="Delete todo"
      >
        ×
      </button>
    </li>
  )
}

export default TodoItem
