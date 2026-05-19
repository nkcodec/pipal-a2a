# Todo App Backend API Specification

## Overview
A RESTful API backend for a Todo application built with Node.js, Express.js, and SQLite.

## Base URL
```
http://localhost:3000
```

## Data Model

### Todo
| Field       | Type          | Description                           |
|-------------|---------------|---------------------------------------|
| id          | INTEGER       | Unique identifier (auto-increment)    |
| title       | TEXT          | Todo title (required)                |
| description | TEXT          | Optional todo description             |
| completed   | BOOLEAN       | Completion status (default: false)    |
| createdAt   | DATETIME      | Creation timestamp                    |
| updatedAt   | DATETIME      | Last update timestamp                 |

---

## API Endpoints

### List All Todos
```
GET /api/todos
```

**Response:** `200 OK`
```json
[
  {
    "id": 1,
    "title": "Buy groceries",
    "description": "Milk, bread, eggs",
    "completed": false,
    "createdAt": "2026-05-20 10:00:00",
    "updatedAt": "2026-05-20 10:00:00"
  }
]
```

---

### Get Single Todo
```
GET /api/todos/:id
```

**Parameters:**
- `id` (path) - Todo ID (integer)

**Response:** `200 OK`
```json
{
  "id": 1,
  "title": "Buy groceries",
  "description": "Milk, bread, eggs",
  "completed": false,
  "createdAt": "2026-05-20 10:00:00",
  "updatedAt": "2026-05-20 10:00:00"
}
```

**Error:** `404 Not Found`
```json
{
  "error": "Todo not found"
}
```

---

### Create Todo
```
POST /api/todos
```

**Request Body:**
```json
{
  "title": "New todo",           // required, string
  "description": "Optional",     // optional, string or null
  "completed": false             // optional, boolean (default: false)
}
```

**Response:** `201 Created`
```json
{
  "id": 1,
  "title": "New todo",
  "description": "Optional",
  "completed": false,
  "createdAt": "2026-05-20 10:00:00",
  "updatedAt": "2026-05-20 10:00:00"
}
```

**Error:** `400 Bad Request`
```json
{
  "error": "Validation failed",
  "details": ["Title is required and must be a non-empty string"]
}
```

---

### Update Todo
```
PUT /api/todos/:id
```

**Parameters:**
- `id` (path) - Todo ID (integer)

**Request Body:**
```json
{
  "title": "Updated title",      // optional, string
  "description": "Updated desc", // optional, string or null
  "completed": true              // optional, boolean
}
```

**Response:** `200 OK`
```json
{
  "id": 1,
  "title": "Updated title",
  "description": "Updated desc",
  "completed": true,
  "createdAt": "2026-05-20 10:00:00",
  "updatedAt": "2026-05-20 10:30:00"
}
```

**Error:** `404 Not Found`
```json
{
  "error": "Todo not found"
}
```

---

### Delete Todo
```
DELETE /api/todos/:id
```

**Parameters:**
- `id` (path) - Todo ID (integer)

**Response:** `204 No Content`

**Error:** `404 Not Found`
```json
{
  "error": "Todo not found"
}
```

---

### Health Check
```
GET /api/health
```

**Response:** `200 OK`
```json
{
  "status": "ok",
  "timestamp": "2026-05-20T10:00:00.000Z"
}
```

---

## Error Responses

All error responses follow this format:
```json
{
  "error": "Error message",
  "details": ["Optional array of validation errors"]
}
```

| Status Code | Description                     |
|-------------|----------------------------------|
| 400         | Bad Request / Validation Error   |
| 404         | Resource Not Found               |
| 500         | Internal Server Error            |

---

## Running the Server

```bash
# Install dependencies
npm install

# Start the server
npm start

# Development mode (with auto-reload)
npm run dev
```

---

## CORS

CORS is enabled by default, allowing requests from any origin. This enables frontend integration without additional configuration.
