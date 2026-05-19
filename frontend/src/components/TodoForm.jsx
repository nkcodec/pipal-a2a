import { useState } from 'react';
import './TodoForm.css';

function TodoForm({ onAdd }) {
  const [title, setTitle] = useState('');

  const handleSubmit = (e) => {
    e.preventDefault();
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;

    onAdd(trimmedTitle);
    setTitle('');
  };

  return (
    <form className="todo-form" onSubmit={handleSubmit}>
      <input
        type="text"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="What needs to be done?"
        className="todo-input"
      />
      <button type="submit" className="todo-submit-btn">
        Add Todo
      </button>
    </form>
  );
}

export default TodoForm;