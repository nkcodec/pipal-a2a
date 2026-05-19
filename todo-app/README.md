# Todo App

A full-stack todo application with Node.js/Express backend and React frontend.

## Architecture

Following clean architecture principles with clear separation of concerns:

```
todo-app/
├── backend/                    # Core business logic + API
│   ├── server.js              # Express server, routes, middleware
│   ├── package.json
│   └── todos.db               # SQLite database
└── frontend/                   # Presentation layer
    ├── src/
    │   ├── App.jsx            # Main component
    │   ├── components/        # UI components
    │   │   └── TodoItem.jsx
    │   ├── hooks/             # Custom React hooks
    │   │   └── useTodos.js
    │   └── services/          # API client
    │       └── api.js
    ├── package.json
    └── dist/                   # Built frontend
```

### Backend (Core Layer)
- **server.js**: RESTful API endpoints, SQLite persistence, error handling
- Pure backend logic with no frontend dependencies

### Frontend (Presentation Layer)
- **api.js**: API client service (infrastructure)
- **useTodos.js**: Custom hook for state management
- **App.jsx**: Main application component
- **TodoItem.jsx**: Individual todo display component

## Running the Application

### 1. Start Backend
```bash
cd backend
npm install
npm start
```
Backend runs on http://localhost:4000

### 2. Start Frontend Dev Server
```bash
cd frontend
npm install
npm run dev
```
Frontend runs on http://localhost:5173 (Vite default)

### 3. Build for Production
```bash
cd frontend
npm run build
# Output in frontend/dist/
```

## API Endpoints

All endpoints require Bearer token authentication (token: `dev-token-12345`)

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/todos` | List all todos |
| POST | `/todos` | Create new todo |
| PUT | `/todos/:id` | Update todo |
| DELETE | `/todos/:id` | Delete todo |
| GET | `/health` | Health check (no auth) |

## Features

✅ Display list of todos  
✅ Add new todo  
✅ Mark todo as complete/incomplete  
✅ Delete todo  
✅ Clean, user-friendly UI with Tailwind CSS  
✅ Proper error handling  
✅ Loading states