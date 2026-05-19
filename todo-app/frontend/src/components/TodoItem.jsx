function TodoItem({ todo, onToggle, onDelete }) {
  return (
    <div 
      className={`flex items-center gap-4 p-4 rounded-xl transition-all
                 ${todo.completed 
                   ? 'bg-green-50 border-2 border-green-200' 
                   : 'bg-gray-50 border-2 border-gray-200 hover:border-indigo-300'}`}
    >
      {/* Checkbox */}
      <button
        onClick={() => onToggle(todo.id)}
        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center
                   transition-all flex-shrink-0
                   ${todo.completed 
                     ? 'bg-green-500 border-green-500 text-white' 
                     : 'border-gray-300 hover:border-indigo-500'}`}
      >
        {todo.completed && (
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} 
                  d="M5 13l4 4L19 7" />
          </svg>
        )}
      </button>

      {/* Task Text */}
      <span 
        className={`flex-1 text-lg transition-all
                   ${todo.completed 
                     ? 'text-gray-400 line-through' 
                     : 'text-gray-700'}`}
      >
        {todo.text}
      </span>

      {/* Delete Button */}
      <button
        onClick={() => onDelete(todo.id)}
        className="p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 
                 rounded-lg transition-all flex-shrink-0"
        aria-label="Delete todo"
      >
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} 
                d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
        </svg>
      </button>
    </div>
  )
}

export default TodoItem