# DIALED 💪

A modern workout tracking web application built with React and TypeScript.

## 🚀 Features

- **Real-time Workout Tracking**: Start workouts, track sets, reps, and weights
- **Exercise Library**: Comprehensive database of exercises with categories
- **Responsive Design**: Clean, intuitive interface
- **Modern UI**: Built with Tailwind CSS

## 🏗️ Tech Stack

### Frontend (`dialed-ui/`)
- **React 19** - UI library
- **Vite** - Build tool and dev server
- **Tailwind CSS 3.4** - Utility-first styling
- **React Router** - Client-side routing

### Backend (`dialed-api/`)
- **Node.js** - Runtime environment
- **Express** - Web framework
- **TypeScript** - Type safety
- **CORS** - Cross-origin resource sharing
- **Morgan** - HTTP request logging

## 🛠️ Development

### Prerequisites
- Node.js 18+ 
- npm or yarn

### Quick Start

1. **Clone the repository**
   ```bash
   git clone https://github.com/JudeHards/DIALED.git
   cd DIALED
   ```

2. **Install dependencies**
   ```bash
   # Frontend
   cd dialed-ui
   npm install
   
   # Backend
   cd ../dialed-api
   npm install
   ```

3. **Start development servers**
   ```bash
   # Terminal 1 - Backend (port 3000)
   cd dialed-api
   npm run dev
   
   # Terminal 2 - Frontend (port 5173)
   cd dialed-ui
   npm run dev
   ```

4. **Access the app**
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:3000

### Available Scripts

#### Frontend (`dialed-ui/`)
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm run lint     # Run ESLint
```

#### Backend (`dialed-api/`)
```bash
npm run dev      # Start development server with nodemon
npm start        # Start production server
npm run build    # Compile TypeScript
```

## 🏋️ Usage

1. **Welcome Screen**: Introduction and app overview
2. **Start Workout**: Begin tracking a new workout session
3. **Exercise Selection**: Choose from categorized exercise library
4. **Workout Tracking**: Log sets, reps, weights in real-time
5. **Routines**: Save and reuse workout routines

## 🔧 Configuration

### Environment Variables
Create `.env` files in respective directories:

**dialed-api/.env**
```
PORT=3000
NODE_ENV=development
```

**dialed-ui/.env**
```
VITE_API_URL=http://localhost:3000
```

## 📦 Deployment

### Frontend
```bash
cd dialed-ui
npm run build
# Deploy dist/ folder to your hosting service
```

### Backend
```bash
cd dialed-api
npm run build
# Deploy compiled JavaScript to your server
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is open source and available under the [MIT License](LICENSE).

## 👨‍💻 Author

**JudeHards**
- GitHub: [@JudeHards](https://github.com/JudeHards)

---

*Built with ❤️ for fitness enthusiasts who want to track their progress digitally.*
