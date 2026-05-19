# Todo API Specification

## Overview
Simple in-memory REST API for todo management built with Express.js.

## Technology
- Node.js + Express.js
- In-memory storage (array)
- CORS enabled

## API Endpoints

### GET /api/todos
- Returns all todos as JSON array
- Status: 200 OK

### POST /api/todos
- Creates a new todo
- Request body: `{ "title": "string" }`
- Response: Created todo with id, completed=false, createdAt
- Status: 201 Created

### PUT /api/todos/:id
- Updates an existing todo by id
- Request body: `{ "title": "string", "completed": boolean }` (all fields optional)
- Response: Updated todo or 404 if not found
- Status: 200 OK / 404 Not Found

### DELETE /api/todos/:id
- Deletes a todo by id
- Response: 204 No Content on success, 404 if not found
- Status: 204 OK / 404 Not Found

## Data Model
```json
{
  "id": "auto-incremented integer as string",
  "title": "string",
  "completed": "boolean",
  "createdAt": "ISO 8601 timestamp"
}
```

## Server Configuration
- Port: 3001
- CORS: Enabled for all origins
- JSON parsing: Enabled
