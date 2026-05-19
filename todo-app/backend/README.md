# Todo App Backend API

A simple REST API for a todo application with SQLite storage and token-based authentication.

## Setup

```bash
npm install
npm start
```

## Configuration

Set the authentication token via environment variable:
```bash
AUTH_TOKEN=your-secret-token npm start
```

## API Endpoints

All endpoints require Bearer token authentication (except `/health`).

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/todos` | List all todos |
| POST | `/todos` | Create a new todo |
| PUT | `/todos/:id` | Update a todo |
| DELETE | `/todos/:id` | Delete a todo |
| GET | `/health` | Health check (no auth) |

## Usage Examples

```bash
# Set token
export AUTH_TOKEN=my-secret-token

# Create todo
curl -X POST http://localhost:3000/todos \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"title": "Buy groceries", "completed": false}'

# List todos
curl http://localhost:3000/todos \
  -H "Authorization: Bearer $AUTH_TOKEN"

# Update todo
curl -X PUT http://localhost:3000/todos/<id> \
  -H "Authorization: Bearer $AUTH_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"completed": true}'

# Delete todo
curl -X DELETE http://localhost:3000/todos/<id> \
  -H "Authorization: Bearer $AUTH_TOKEN"
```

## Todo Fields

- `id` (string): UUID
- `title` (string): Todo title
- `completed` (boolean): Completion status
- `createdAt` (string): ISO timestamp