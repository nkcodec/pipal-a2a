import './TodoItem.css';

function TodoItem({ todo, onToggle, onDelete }) {
  const handleToggle = () => {
    onToggle(todo.id);
  };

  const handleDelete = () => {
    onDelete(todo.id);
  };

  return (
    <li className={`todo-item ${todo.completed ? 'completed' : ''}`}>
      <label className="todo-item-label">
        <input
          type="checkbox"
          checked={todo.completed}
          onChange={handleToggle}
          className="todo-checkbox"
        />
        <span className="todo-title">{todo.title}</span>
      </label>
      <button
        onClick={handleDelete}
        className="todo-delete-btn"
        aria-label="Delete todo"
      >
        Delete
      </button>
    </li>
  );
}

export default TodoItem;