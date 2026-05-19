# Todo App - React Frontend

## Overview
A clean, functional React todo app that connects to a backend API for CRUD operations.

## Tech Stack
- **Build Tool**: Vite
- **Framework**: React 18
- **Styling**: CSS (App.css)
- **API**: REST API at http://localhost:3001/api/todos

## Features
1. **Display Todos** - List all todos with checkbox, title, and delete button
2. **Add Todo** - Input field + button to create new todos
3. **Toggle Completion** - Click checkbox to mark complete/incomplete
4. **Delete Todo** - Click button to remove a todo
5. **Loading State** - Show spinner while fetching data
6. **Error Handling** - Display error messages when API calls fail

## API Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | /api/todos | Fetch all todos |
| POST | /api/todos | Create new todo |
| PATCH | /api/todos/:id | Update todo (toggle complete) |
| DELETE | /api/todos/:id | Delete a todo |

## Data Model
```json
{
  "id": "string",
  "title": "string",
  "completed": false
}
```

## UI Components
- **TodoInput** - Text input + Add button
- **TodoList** - Container for todo items
- **TodoItem** - Single todo with checkbox, title, delete button
- **LoadingSpinner** - Animated loading indicator
- **ErrorMessage** - Error display component

## Design
- Clean, minimalist interface
- Checkbox for completion toggle
- Strikethrough text for completed todos
- Subtle hover effects on interactive elements
- Responsive layout
