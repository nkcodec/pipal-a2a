# Calculator Frontend

A modern, responsive calculator frontend built with **Next.js 14** (App Router).

## Features

- Beautiful dark-themed UI with gradient background
- Full arithmetic operations: add, subtract, multiply, divide
- Chained calculations (e.g., `2 + 3 × 4`)
- Backspace and clear functionality
- Loading states with animated progress bar
- Graceful error handling with inline error banners
- Responsive design for mobile and desktop

## Prerequisites

- **Node.js** 18+ 
- The **calculator backend** running on `http://localhost:3001`

## Setup

```bash
# Navigate to the frontend directory
cd calculator-app/frontend

# Install dependencies
npm install
```

## Running

```bash
# Start the development server (port 3000)
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser.

## How It Works

The calculator sends `POST` requests to the backend API at `http://localhost:3001/api/calculate` with the following JSON body:

```json
{
  "operand1": 5,
  "operand2": 3,
  "operation": "add"
}
```

Supported operations: `add`, `subtract`, `multiply`, `divide`

## Project Structure

```
frontend/
├── app/
│   ├── components/
│   │   ├── Calculator.js    # Main calculator component
│   │   └── Calculator.css   # Calculator styles
│   ├── globals.css           # Global styles & CSS variables
│   ├── layout.js             # Root layout
│   └── page.js               # Home page
├── jsconfig.json
├── next.config.js
├── package.json
└── README.md
```

## Build for Production

```bash
npm run build
npm start
```
