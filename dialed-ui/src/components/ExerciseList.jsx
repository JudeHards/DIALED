import { useEffect, useState } from 'react';
import api from '../lib/api';

export default function ExerciseList() {
  const [exercises, setExercises] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.getExercises()
      .then((list) => setExercises(list))
      .catch((err) => setError(err.message || err))
      .finally(() => setLoading(false));
  }, []);

  if (loading)
    return (
      <div className="w-full h-48 flex items-center justify-center">
        <div className="text-sm text-slate-400">Loading exercises…</div>
      </div>
    );
  if (error)
    return (
      <div className="w-full h-48 flex items-center justify-center">
        <div className="text-sm text-rose-500">{String(error)}</div>
      </div>
    );

  if (!exercises || exercises.length === 0)
    return (
      <div className="w-full h-48 flex items-center justify-center">
        <div className="text-sm text-slate-400">No exercises available.</div>
      </div>
    );

  return (
    <div className="flex flex-col gap-6">
      {exercises.map((ex) => (
        <section key={ex.id} className="min-h-[60vh] w-full bg-slate-950 text-slate-100 p-8 flex flex-col justify-center rounded-2xl shadow-2xl">
          <div className="max-w-3xl">
            <h2 className="text-3xl font-extrabold tracking-tight">{ex.name}</h2>
            <div className="mt-3 flex gap-3 flex-wrap text-sm text-slate-400">
              <span>Primary: {ex.primaryMuscle}</span>
              {ex.secondaryMuscles && ex.secondaryMuscles.length > 0 && (
                <span>Secondary: {ex.secondaryMuscles.join(', ')}</span>
              )}
              {ex.equipment && <span>• {ex.equipment}</span>}
              {ex.movement && <span>• {ex.movement}</span>}
            </div>

            <div className="mt-6 grid gap-3 md:grid-cols-2">
              {ex.sets.map((s, i) => (
                <div key={i} className="rounded-lg bg-slate-900/60 p-3">
                  <div className="text-xs text-slate-400">Set {i + 1}</div>
                  <div className="mt-1 font-medium">{s.reps} reps • {s.weight || '—'} lbs</div>
                </div>
              ))}
            </div>
          </div>
        </section>
      ))}
    </div>
  );
}
