# Todo App Frontend

A modern React todo application with a clean, intuitive UI.

## Features

- ✅ Add new todos with the input field + Add button (or press Enter)
- ✅ Complete/uncomplete todos with checkboxes
- ✅ Delete todos with the trash icon button
- ✅ Visual distinction between completed (green, strikethrough) and pending tasks
- ✅ Responsive design for all screen sizes
- ✅ Task counter showing completion progress

## Tech Stack

- **Vite** - Fast build tool and dev server
- **React** - UI library with hooks for state management
- **Tailwind CSS** - Utility-first styling

## Getting Started

### Install dependencies

```bash
cd todo-app/frontend
npm install
```

### Run development server

```bash
npm run dev
```

The app will be available at `http://localhost:5173`

### Build for production

```bash
npm run build
```

Output will be in the `dist/` folder.

### Preview production build

```bash
npm run preview
```

## Project Structure

```
frontend/
├── index.html          # Entry HTML
├── package.json        # Dependencies & scripts
├── vite.config.js      # Vite configuration
├── tailwind.config.js  # Tailwind configuration
├── postcss.config.js   # PostCSS configuration
└── src/
    ├── main.jsx        # React entry point
    ├── App.jsx         # Main app component with state
    ├── index.css       # Tailwind imports
    └── components/
        └── TodoItem.jsx  # Individual todo item component
```

## Usage

1. Type your task in the input field
2. Click "Add" or press Enter to create the todo
3. Click the checkbox to mark as complete
4. Click the trash icon to delete
5. Track your progress with the counter at the bottom