import TodoItem from './TodoItem.jsx';
import './TodoList.css';

function TodoList({ todos, onToggle, onDelete }) {
  if (todos.length === 0) {
    return <div className="todo-list-empty">No todos yet. Add one below!</div>;
  }

  return (
    <ul className="todo-list">
      {todos.map((todo) => (
        <TodoItem
          key={todo.id}
          todo={todo}
          onToggle={onToggle}
          onDelete={onDelete}
        />
      ))}
    </ul>
  );
}

export default TodoList;