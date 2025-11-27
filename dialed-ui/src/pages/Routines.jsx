import TopBar from "../components/TopBar";
import Screen from "../components/Screen";
import { Link } from "react-router-dom";
import { useState } from "react";
import ExerciseList from "../components/ExerciseList";
import { useEffect } from "react";
import api from "../lib/api";
import { useNavigate } from "react-router-dom";

const routines = [
  { name: "Push Day", desc: "Chest, shoulders, triceps" },
  { name: "Pull Day", desc: "Back, biceps" },
  { name: "Legs", desc: "Quads, hams, glutes" },
  { name: "Upper", desc: "Compound focus" },
  { name: "Full Body", desc: "Balanced split" },
];

export default function Routines() {
  const [showExercises, setShowExercises] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [allExercises, setAllExercises] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [workoutName, setWorkoutName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    api.getExercises().then(setAllExercises).catch(() => setAllExercises([]));
  }, []);
  return (
    <>
      <TopBar title="Routines" />
      <Screen>
        <div className="flex items-center justify-between mb-3">
          <div className="text-lg font-medium">Saved routines</div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreate(true)}
              className="text-sm rounded px-3 py-1 border border-slate-700 bg-slate-900/60"
            >
              Create workout
            </button>
            <button
              onClick={() => setShowExercises((s) => !s)}
              className="text-sm rounded px-3 py-1 border border-slate-700 bg-slate-900/60"
            >
              {showExercises ? 'Hide exercises' : 'Show exercises'}
            </button>
          </div>
        </div>

        {!showExercises ? (
          <div className="grid gap-3">
            {routines.map((r) => (
              <Link
                key={r.name}
                to="/workout"
                className="rounded-2xl border border-slate-800 bg-slate-900/50 p-4 hover:bg-slate-900 transition"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{r.name}</div>
                    <div className="text-xs text-slate-400">{r.desc}</div>
                  </div>
                  <span className="text-slate-500">›</span>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="fixed inset-0 z-50 flex items-start justify-center p-6 bg-slate-900/80">
            <div className="w-full max-w-5xl overflow-auto">
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowExercises(false)}
                  className="rounded px-3 py-2 bg-slate-800 text-sm"
                >
                  Close
                </button>
              </div>
              <ExerciseList />
            </div>
          </div>
        )}
      </Screen>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/80">
          <div className="w-full max-w-2xl bg-slate-950 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Create workout</h3>
              <button onClick={() => setShowCreate(false)} className="text-sm">Close</button>
            </div>

            <input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="Workout name" className="w-full mb-3 rounded px-3 py-2 bg-slate-900/60" />

            <div className="grid gap-2 max-h-60 overflow-auto mb-4">
              {allExercises.map((ex) => (
                <label key={ex.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-900/50">
                  <input type="checkbox" checked={selected.has(ex.id)} onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(ex.id); else next.delete(ex.id);
                    setSelected(next);
                  }} />
                  <div>
                    <div className="font-medium">{ex.name}</div>
                    <div className="text-xs text-slate-400">{ex.primaryMuscle}</div>
                  </div>
                </label>
              ))}
            </div>

            <div className="flex justify-end gap-2">
              <button className="rounded px-3 py-2 bg-slate-800" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="rounded px-3 py-2 bg-blue-600 text-white" onClick={async () => {
                const ids = Array.from(selected);
                if (!workoutName || ids.length === 0) return alert('Please provide a name and select exercises');
                // Build payload: create a workout template with exercise ids
                const payload = {
                  name: workoutName,
                  description: '',
                  exercises: ids.map(id => ({ id })),
                };
                // For now, POST as a workout to /api/workouts
                try {
                  const res = await api.createWorkout(payload);
                  setShowCreate(false);
                  navigate(`/start-workout/${res.id}`);
                } catch (err) {
                  alert('Failed to create workout: ' + String(err));
                }
              }}>Create</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
