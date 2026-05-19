# Todo App Architecture Spec

## Overview
A full-stack todo application with Node.js/Express backend and React frontend.

## Tech Stack
- **Backend**: Node.js, Express.js, in-memory storage (JSON)
- **Frontend**: React, CSS, plain CSS (no Tailwind)
- **Communication**: REST API

## Backend Specification

### API Endpoints
```
GET    /api/todos        - List all todos
POST   /api/todos        - Create a new todo
PUT    /api/todos/:id    - Update a todo (title, completed)
DELETE /api/todos/:id    - Delete a todo
```

### Todo Data Model
```json
{
  "id": "string (UUID)",
  "title": "string",
  "completed": "boolean",
  "createdAt": "ISO date string"
}
```

### Response Format
```json
{
  "success": true,
  "data": <payload>
}
```

### Port
- Server runs on `http://localhost:3001`

---

## Frontend Specification

### Components
1. **App** - Main container
2. **TodoList** - Displays list of todos
3. **TodoItem** - Single todo with checkbox, title, delete button
4. **TodoForm** - Input form to add new todos

### Features
- Add new todos via text input
- Toggle todo completion (checkbox)
- Delete todos
- Show completed/incomplete counts
- Persist todos via API calls

### Styling
- Clean, minimal design with plain CSS
- Responsive layout
- Visual feedback for completed items (strikethrough)

### Port
- Frontend dev server on `http://localhost:3000`

### API Integration
- Fetch todos on mount
- Optimistic UI updates where possible
- Error handling with user feedback

---

## Project Structure
```
/workspace
├── backend/
│   ├── package.json
│   ├── server.js
│   └── todoStore.js
└── frontend/
    ├── package.json
    ├── index.html
    ├── src/
    │   ├── index.jsx
    │   ├── App.jsx
    │   ├── App.css
    │   ├── components/
    │   │   ├── TodoList.jsx
    │   │   ├── TodoList.css
    │   │   ├── TodoItem.jsx
    │   │   ├── TodoItem.css
    │   │   ├── TodoForm.jsx
    │   │   └── TodoForm.css
    │   └── api/
    │       └── todos.js
```