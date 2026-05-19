# Todo App Frontend Specification

## Overview
A clean, minimal React todo application with filtering capabilities and API integration.

## Tech Stack
- **React 18** with Vite
- **CSS** for styling (no frameworks)
- **Fetch API** for HTTP requests

## API Integration
- **Base URL:** `http://localhost:3001/api`
- **Endpoints:**
  - `GET /todos` - Fetch all todos
  - `POST /todos` - Create a new todo
  - `PATCH /todos/:id` - Update a todo (toggle completion)
  - `DELETE /todos/:id` - Delete a todo

## Components

### App.jsx
- Root component managing state and layout
- Integrates with useTodos hook
- Handles loading and error states

### TodoList.jsx
- Displays the filtered list of todos
- Renders TodoItem components

### TodoItem.jsx
- Individual todo with:
  - Checkbox for completion (green when complete)
  - Title with strikethrough for completed items
  - Delete button (red on hover)

### TodoForm.jsx
- Input field for new todo title
- Submit button to add todo

### FilterTabs.jsx
- Three tabs: All / Active / Completed
- Shows remaining items count

## UI Design

### Colors
- Background: `#f5f5f5` (light gray)
- Container: `#ffffff` (white)
- Primary text: `#333333`
- Secondary text: `#666666`
- Completed checkbox: `#4CAF50` (green)
- Delete button: `#e74c3c` (red on hover)
- Active tab: `#007bff` (blue)

### Typography
- Font family: system-ui, -apple-system, sans-serif
- Title: 24px bold
- Todo text: 16px
- Small text: 14px

### Spacing
- Container padding: 24px
- Item padding: 12px
- Gap between items: 8px

### Interactive States
- Checkbox: cursor pointer, scale on hover
- Delete button: opacity 0 on normal, 1 on hover
- Input: focus ring with primary color
- Submit button: hover darkening

## Responsive Design
- Max-width container: 500px
- Centered layout
- Full-width on mobile
