# Calculator Backend

Express API server for the calculator application.

## Setup

```bash
npm install
```

## Run

```bash
# Production
npm start

# Development (auto-restart on file changes, Node ≥ 18.11)
npm run dev
```

The server starts on **http://localhost:3001**.

## API

### `POST /api/calculate`

**Request body:**

```json
{
  "operand1": 10,
  "operand2": 5,
  "operation": "add"
}
```

Supported operations: `add`, `subtract`, `multiply`, `divide`.

**Success response (200):**

```json
{ "result": 15 }
```

**Error response (400):**

```json
{ "error": "Division by zero is not allowed" }
```

### `GET /api/health`

Returns `{ "status": "ok" }` — useful for smoke tests.

## CORS

Enabled for `http://localhost:3000` (the frontend dev server).
