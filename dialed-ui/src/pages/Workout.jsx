// src/pages/Workout.jsx
import { useEffect, useState } from "react";
import TopBar from "../components/TopBar";
import Screen from "../components/Screen";
import api from "../lib/api";
import { Link, useNavigate } from "react-router-dom";

export default function Workout() {
  const [last, setLast] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [allExercises, setAllExercises] = useState([]);
  const [selected, setSelected] = useState(new Set());
  const [workoutName, setWorkoutName] = useState('New Workout');
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const navigate = useNavigate();

  // Get unique muscle groups from exercises
  const muscleGroups = [...new Set(allExercises.map(ex => ex.primaryMuscle))].sort();
  
  // Filter exercises by selected muscle group
  const filteredExercises = selectedMuscle 
    ? allExercises.filter(ex => ex.primaryMuscle === selectedMuscle)
    : [];

  useEffect(() => {
    api.getExercises().then(setAllExercises).catch(() => setAllExercises([]));
  }, []);

  useEffect(() => {
    // Prefer backend data, fallback to localStorage
    api
      .getWorkouts()
      .then((list) => {
        if (!Array.isArray(list) || list.length === 0) throw new Error('no workouts');
        // pick the most recent by createdAt
        const sorted = list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        setLast(sorted[0]);
      })
      .catch(() => {
        // Try to find any workout in localStorage
        const keys = Object.keys(localStorage).filter(k => k.startsWith('dialed:lastWorkout:'));
        if (keys.length === 0) return;
        
        try {
          const lastKey = keys[keys.length - 1];
          const raw = localStorage.getItem(lastKey);
          if (!raw) return;
          setLast(JSON.parse(raw));
        } catch {
          setLast(null);
        }
      });
  }, []);

  // Optional: quick way to begin a new session
  const StartButton = (
    <Link
      to="/start-workout"
      className="rounded-xl border border-slate-700 px-3 py-1.5 text-sm hover:bg-slate-800/60 transition"
    >
      Start
    </Link>
  );

  return (
    <>
      <TopBar title={last?.name ?? 'Workout'} right={StartButton} />
      <Screen>
        {last ? (
          <>
            <p className="mb-3 text-sm text-slate-400">Last completed: {new Date(last.date).toLocaleString()}</p>

            <div className="space-y-3">
              {(last.sets || []).map((s, i) => (
                <div key={i} className="rounded-2xl border border-slate-800/80 bg-slate-900/50 p-4">
                  <div className="flex items-start gap-3">
                    <div className="h-8 w-8 shrink-0 rounded-xl bg-slate-800 grid place-items-center text-xs text-slate-300">{i + 1}</div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-slate-100 text-lg leading-tight">{s.name}</p>

                      <div className="mt-3 flex flex-wrap items-center gap-3">
                        <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm">
                          <span className="text-xs text-slate-400 mr-2">Weight</span>
                          <span className="font-medium">{(s.weight ?? '—')}</span>
                        </span>
                        <span className="inline-flex items-center rounded-lg border border-slate-800 bg-slate-900/70 px-3 py-1.5 text-sm">
                          <span className="text-xs text-slate-400 mr-2">Reps</span>
                          <span className="font-medium">{(s.reps ?? '—')}</span>
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </>
        ) : (
          <div className="rounded-2xl border border-slate-800 bg-slate-900/50 p-6 text-center">
            <div className="text-xl font-semibold mb-2">No workouts yet</div>
            <div className="text-sm text-slate-400 mb-4">Start by adding exercises to create your first workout.</div>
            <div className="flex justify-center">
              <button onClick={() => setShowCreate(true)} className="rounded-xl border border-slate-800 bg-slate-900/70 px-4 py-2">Add exercise</button>
            </div>
          </div>
        )}
      </Screen>

      {showCreate && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-slate-900/80">
          <div className="w-full max-w-2xl bg-slate-950 rounded-2xl p-6">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-medium">Add exercise to workout</h3>
              <button onClick={() => setShowCreate(false)} className="text-sm">Close</button>
            </div>

            <input value={workoutName} onChange={(e) => setWorkoutName(e.target.value)} placeholder="Workout name" className="w-full mb-3 rounded px-3 py-2 bg-slate-900/60" />

            {/* Muscle group selection */}
            {!selectedMuscle && (
              <div className="grid gap-2 max-h-[60vh] overflow-auto mb-4">
                <div className="text-sm text-slate-400 mb-2">Select muscle group:</div>
                {muscleGroups.map((muscle) => (
                  <button
                    key={muscle}
                    onClick={() => setSelectedMuscle(muscle)}
                    className="flex items-center gap-3 p-4 rounded-xl border border-slate-800 bg-slate-900/50 hover:bg-slate-900/70 text-left transition"
                  >
                    <div className="flex-1">
                      <div className="font-medium capitalize">{muscle}</div>
                      <div className="text-xs text-slate-400 mt-1">
                        {allExercises.filter(ex => ex.primaryMuscle === muscle).length} exercises
                      </div>
                    </div>
                  </button>
                ))}
              </div>
            )}

            {/* Exercise selection */}
            {selectedMuscle && (
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="text-sm text-slate-400">
                    Select exercises for <span className="text-white capitalize">{selectedMuscle}</span>:
                  </div>
                  <button 
                    onClick={() => setSelectedMuscle(null)} 
                    className="text-sm text-slate-500 hover:text-slate-300"
                  >
                    ← Back to muscle groups
                  </button>
                </div>

                <div className="grid gap-2 max-h-[50vh] overflow-auto mb-4">
                  {filteredExercises.map((ex) => (
                    <label key={ex.id} className="flex items-center gap-3 p-3 rounded-lg border border-slate-800 hover:bg-slate-900/50">
                      <input
                        type="checkbox"
                        checked={selected.has(ex.id)}
                        onChange={(e) => {
                          const next = new Set(selected);
                          if (e.target.checked) next.add(ex.id); else next.delete(ex.id);
                          setSelected(next);
                        }}
                        className="h-4 w-4 rounded border-slate-700"
                      />
                      <div className="flex-1">
                        <div className="font-medium">{ex.name}</div>
                        {ex.equipment && (
                          <div className="text-xs text-slate-400 mt-0.5">
                            Equipment: {ex.equipment}
                          </div>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="flex justify-end gap-2">
              <button className="rounded px-3 py-2 bg-slate-800" onClick={() => setShowCreate(false)}>Cancel</button>
              <button className="rounded px-3 py-2 bg-blue-600 text-white" onClick={async () => {
                const ids = Array.from(selected);
                if (!workoutName || ids.length === 0) return alert('Please provide a name and select exercises');
                const payload = { name: workoutName, description: '', exercises: ids };
                try {
                  const res = await api.createWorkout(payload);
                  setShowCreate(false);
                  navigate(`/start-workout/${res.id}`);
                } catch (err) {
                  alert('Failed to create workout: ' + String(err));
                }
              }}>Create workout</button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
