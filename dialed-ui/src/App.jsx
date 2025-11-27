import { Routes, Route, Navigate } from "react-router-dom";
import BottomMenu from "./components/BottomMenu";
import Welcome from "./pages/Welcome";
import Routines from "./pages/Routines";
import Workout from "./pages/Workout";
import StartWorkout from "./pages/StartWorkout";

export default function App() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-200">
      <Routes>
        {/* Home (startup) */}
        <Route path="/" element={<Welcome />} />

        {/* Other pages */}
        <Route path="/routines" element={<Routines />} />
        <Route path="/workout" element={<Workout />} />
  <Route path="/start-workout/:id?" element={<StartWorkout />} />

        {/* Unknown → Home */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>

      <BottomMenu />
    </div>
  );
}
