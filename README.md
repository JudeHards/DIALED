# DIALED

Workout tracking app built with React and TypeScript.

## Features

- Track workouts with sets, reps, and weights
- Exercise database with categories
- Clean web interface

## Tech Stack

**Frontend:**
- React 19
- Vite
- Tailwind CSS
- React Router

**Backend:**
- Node.js
- Express
- TypeScript

## Development

Clone and install:
```bash
git clone https://github.com/JudeHards/DIALED.git
cd DIALED

# Install frontend deps
cd dialed-ui && npm install

# Install backend deps  
cd ../dialed-api && npm install
```

Run both servers:
```bash
# Backend (port 3000)
cd dialed-api && npm run dev

# Frontend (port 5173) 
cd dialed-ui && npm run dev
```

Open http://localhost:5173

## Scripts

Frontend:
- `npm run dev` - dev server
- `npm run build` - build for production

Backend:
- `npm run dev` - dev server  
- `npm run build` - compile TypeScript
