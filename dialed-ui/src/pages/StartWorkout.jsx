// src/pages/StartWorkout.jsx
import { useState, useEffect } from "react";
import TopBar from "../components/TopBar";
import Screen from "../components/Screen";
import api from "../lib/api";
import { useParams, useNavigate } from "react-router-dom";
import { X } from 'lucide-react';

export default function StartWorkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [template, setTemplate] = useState(null);
  // entries is an array matching template.exercises; each item is an array of set objects { weight, reps, done }
  const [entries, setEntries] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [allExercises, setAllExercises] = useState([]);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [selectedMuscle, setSelectedMuscle] = useState(null);

  // Get unique muscle groups from exercises
  const muscleGroups = [...new Set(allExercises.map(ex => ex.primaryMuscle))].sort();
  
  // Filter exercises by selected muscle group
  const filteredExercises = selectedMuscle 
    ? allExercises.filter(ex => ex.primaryMuscle === selectedMuscle)
    : [];

  useEffect(() => {
    if (!id) return;
    api.getWorkout(id).then((w) => {
      setTemplate(w);
      setEntries(w.exercises.map((ex) => ex.sets.map((s) => ({ weight: s.weight ?? "", reps: s.reps ?? "", done: s.completed ?? false }))));
    }).catch(() => {
      // fallback: navigate back
      navigate('/routines');
    });
  }, [id]);

  useEffect(() => {
    api.getExercises().then(setAllExercises).catch(() => setAllExercises([]));
  }, []);

  const [syncError, setSyncError] = useState(null);

  const updateField = async (exerciseIndex, setIndex, field, value) => {
    setEntries((prev) => {
      const next = prev.map((sets) => sets.slice());
      next[exerciseIndex] = next[exerciseIndex].map((s, idx) => (idx === setIndex ? { ...s, [field]: value } : s));
      return next;
    });

    if (template?.id) {
      try {
        const exercise = template.exercises[exerciseIndex];
        await api.updateExerciseSet(template.id, exercise.id, setIndex, {
          [field]: value || null,
        });
        setSyncError(null);
      } catch (err) {
        console.warn('Failed to sync set update:', err);
        setSyncError('Changes will be saved when back online');
      }
    }
  };

  const toggleDone = async (exerciseIndex, setIndex) => {
    // Only toggle if both weight and reps are filled
    const currentSet = entries[exerciseIndex][setIndex];
    if (!currentSet.weight || !currentSet.reps) return;

    setEntries((prev) => {
      const next = prev.map((sets) => sets.slice());
      next[exerciseIndex][setIndex] = { ...next[exerciseIndex][setIndex], done: !next[exerciseIndex][setIndex].done };
      return next;
    });

    if (template?.id) {
      try {
        const exercise = template.exercises[exerciseIndex];
        await api.updateExerciseSet(template.id, exercise.id, setIndex, {
          completed: !entries[exerciseIndex][setIndex].done,
          weight: entries[exerciseIndex][setIndex].weight,
          reps: entries[exerciseIndex][setIndex].reps
        });
        setSyncError(null);
      } catch (err) {
        console.warn('Failed to sync set completion:', err);
        setSyncError('Changes will be saved when back online');
      }
    }
  };

  const addSet = (exerciseIndex) =>
    setEntries((prev) => {
      const next = prev.map((sets) => sets.slice());
      next[exerciseIndex] = [...(next[exerciseIndex] || []), { weight: "", reps: "", done: false }];
      return next;
    });

  const [isSaving, setIsSaving] = useState(false);
  
  const handleComplete = async () => {
    if (isSaving) return;
    setIsSaving(true);
    setSyncError(null);

    const baseName = template ? template.name : 'Unnamed Workout';
    const payload = {
      workoutName: baseName,
      date: new Date().toISOString(),
      sets: (template ? template.exercises : []).map((ex, i) => ({
        exerciseId: ex.id,
        name: ex.name,
        sets: (entries[i] || []).map((s) => ({ 
          weight: s.weight || null, 
          reps: s.reps || null,
          completed: s.done || false
        }))
      })),
    };

    try {
      // First try to sync any pending set updates
      if (template?.id) {
        await api.updateWorkout(template.id, {
          ...template,
          exercises: template.exercises.map((ex, i) => ({
            ...ex,
            sets: entries[i].map(s => ({
              weight: s.weight || null,
              reps: s.reps || null,
              completed: s.done || false
            }))
          }))
        });
      }

      // Then create the completed workout
      await api.createWorkout(payload);
      navigate('/workouts');
    } catch (err) {
      console.warn('Failed to save workout:', err);
      
      // Store offline for later sync
      const offlineKey = `dialed:pendingWorkout:${new Date().getTime()}`;
      const offlineWorkouts = JSON.parse(localStorage.getItem('dialed:pendingWorkouts') || '[]');
      
      localStorage.setItem(offlineKey, JSON.stringify(payload));
      localStorage.setItem('dialed:pendingWorkouts', JSON.stringify([...offlineWorkouts, offlineKey]));
      
      setSyncError('Workout saved offline. Will sync when connection is restored.');
    } finally {
      setIsSaving(false);
    }
  };

  const openAddModal = () => {
    setSelectedIds(new Set());
    setSelectedMuscle(null);
    setShowAddModal(true);
  };

  const toggleSelect = (eid) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(eid)) next.delete(eid); else next.add(eid);
      return next;
    });
  };

  const handleAddExercises = async () => {
    if (!selectedIds.size) return setShowAddModal(false);
    const toAdd = allExercises.filter((e) => selectedIds.has(e.id)).map((e) => ({ ...e }));

    const newTemplate = { ...(template || { name: 'Custom' }) };
    newTemplate.exercises = [...(template?.exercises || []), ...toAdd];

    setTemplate(newTemplate);
    // Initialize each new exercise with an array containing one empty set
    setEntries((prev) => [...prev, ...toAdd.map(() => [{ weight: "", reps: "", done: false }])]);

    if (id) {
      try {
        await api.updateWorkout(id, newTemplate);
      } catch (err) {
        console.warn('Failed to persist added exercises', err);
      }
    }

    setShowAddModal(false);
  };

  // When adding a new exercise:
  const handleAddExercise = (exercise) => {
    const newExercise = {
      ...exercise,
      sets: [], // Ensure sets is always an array!
    };
    setTemplate((prev) => ({
      ...prev,
      exercises: [...prev.exercises, newExercise],
    }));
    setEntries((prev) => [
      ...prev,
      [], // Initialize entries for the new exercise as an empty array
    ]);
  };

  return (
    <>
      <TopBar title="Workout in progress" />
      <Screen>

        <div className="flex justify-end">
          <button
            onClick={openAddModal}
            className="rounded-xl border border-slate-800 bg-slate-900/70 px-3 py-2 text-sm"
          >
            + Add exercise
          </button>
        </div>

        {syncError && (
          <div className="mt-2 text-sm text-yellow-400/80 text-center bg-yellow-400/10 rounded-lg py-2 px-3">
            {syncError}
          </div>
        )}

        <div className="space-y-3 mt-4">
          {(template ? template.exercises : []).map((exercise, i) => (
            <ExerciseBlock
              key={exercise.id || i}
              index={i + 1}
              name={exercise.name}
              sets={entries[i] || []}
              onChange={(setIndex, field, val) => updateField(i, setIndex, field, val)}
              onToggle={(setIndex) => toggleDone(i, setIndex)}
              onAddSet={() => addSet(i)}
            />
          ))}
        </div>

        <div className="h-3" />
        <button
          onClick={handleComplete}
          disabled={isSaving}
          className={[
            "w-full rounded-xl border px-4 py-3 font-medium transition",
            isSaving 
              ? "border-slate-800 bg-slate-900/40 text-slate-400 cursor-not-allowed"
              : "border-slate-800 bg-slate-900/70 hover:bg-slate-900"
          ].join(" ")}
        >
          {isSaving ? "Saving..." : "Complete Workout"}
        </button>
        {showAddModal && (
          <div className="fixed inset-0 z-50 grid place-items-center bg-black/60">
            <div className="w-full max-w-2xl bg-slate-950 rounded-xl border border-slate-800 p-4">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-lg font-medium">Add Exercises</h3>
                <button 
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedMuscle(null);
                  }} 
                  className="p-1 rounded hover:bg-slate-900/30"
                >
                  <X size={18} />
                </button>
              </div>

              <div className="space-y-2 max-h-80 overflow-auto">
                {!selectedMuscle ? (
                  // Muscle group selection view
                  <>
                    <p className="text-sm text-slate-400 mb-2">Select a muscle group:</p>
                    {muscleGroups.length === 0 ? (
                      <p className="text-sm text-slate-400">No exercises found</p>
                    ) : (
                      muscleGroups.map((muscle) => (
                        <div
                          key={muscle}
                          onClick={() => setSelectedMuscle(muscle)}
                          className="p-3 rounded cursor-pointer hover:bg-slate-900/30 border border-slate-800"
                        >
                          <span className="text-slate-100">{muscle}</span>
                        </div>
                      ))
                    )}
                  </>
                ) : (
                  // Exercise selection view for selected muscle group
                  <>
                    <div className="mb-3 flex items-center">
                      <button
                        onClick={() => setSelectedMuscle(null)}
                        className="text-sm text-slate-400 hover:text-slate-300 flex items-center gap-1"
                      >
                        ← Back
                      </button>
                      <span className="ml-3 text-slate-300">{selectedMuscle}</span>
                    </div>
                    {filteredExercises.map((ex) => (
                      <label key={ex.id} className="flex items-center gap-3 p-2 rounded hover:bg-slate-900/30">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(ex.id)}
                          onChange={() => toggleSelect(ex.id)}
                          className="w-4 h-4"
                        />
                        <div className="flex-1">
                          <div className="font-medium text-sm text-slate-100">{ex.name}</div>
                        </div>
                      </label>
                    ))}
                  </>
                )}
              </div>

              <div className="mt-4 flex justify-end gap-2">
                <button 
                  onClick={() => {
                    setShowAddModal(false);
                    setSelectedMuscle(null);
                  }} 
                  className="px-3 py-2 rounded border border-slate-800"
                >
                  Cancel
                </button>
                <button onClick={handleAddExercises} className="px-4 py-2 rounded bg-slate-900/70">Add selected</button>
              </div>
            </div>
          </div>
        )}
      </Screen>
    </>
  );
}

// Timer removed — no timers in the app per UX requirement.

function SetRow({ index, name, value, onChange, onToggle }) {
  return (
    <div className="rounded-2xl border border-neutral-800 bg-neutral-900/40 p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-xl bg-neutral-800 grid place-items-center text-xs text-neutral-300 shrink-0">
          {index}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-neutral-100 truncate">{name}</p>

          {/* Inputs: stack on small screens, row on >=sm */}
          <div className="mt-3 grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] items-center gap-3">
            <input
              inputMode="decimal"
              placeholder="Weight"
              className="w-full min-w-0 rounded-lg bg-neutral-800/70 border border-neutral-700 px-3 py-2 text-sm outline-none"
              value={value.weight}
              onChange={(e) => onChange("weight", e.target.value)}
            />
            <input
              inputMode="numeric"
              placeholder="Reps"
              className="w-full sm:w-24 min-w-0 rounded-lg bg-neutral-800/70 border border-neutral-700 px-3 py-2 text-sm outline-none"
              value={value.reps}
              onChange={(e) => onChange("reps", e.target.value)}
            />

            <button
              onClick={onToggle}
              className={[
                "justify-self-start sm:justify-self-auto shrink-0 rounded-lg border px-3 py-2 text-sm transition",
                value.done ? "border-neutral-600 bg-neutral-800/40" : "border-neutral-700 hover:bg-neutral-800",
              ].join(" ")}
              aria-pressed={value.done}
            >
              ✓
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function ExerciseBlock({ index, name, sets, onChange, onToggle, onAddSet }) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900/40 p-4">
      <div className="flex items-start gap-3">
        <div className="h-8 w-8 rounded-xl bg-slate-800 grid place-items-center text-xs text-slate-300 shrink-0">
          {index}
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-medium text-slate-100 truncate">{name}</p>

          <div className="mt-3 space-y-2">
            {sets.map((s, si) => (
              <div key={si} className="flex items-center gap-3">
                <div className="flex-1 grid grid-cols-2 gap-3">
                  <input
                    inputMode="decimal"
                    placeholder="Weight"
                    className="w-full min-w-0 rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm outline-none"
                    value={s.weight}
                    onChange={(e) => onChange(si, 'weight', e.target.value)}
                  />
                  <input
                    inputMode="numeric"
                    placeholder="Reps"
                    className="w-full min-w-0 rounded-lg bg-slate-800/70 border border-slate-700 px-3 py-2 text-sm outline-none"
                    value={s.reps}
                    onChange={(e) => onChange(si, 'reps', e.target.value)}
                  />
                </div>
                <button
                  onClick={() => {
                    // Only allow toggling if both weight and reps have values
                    if (s.weight && s.reps) {
                      onToggle(si);
                    }
                  }}
                  disabled={!s.weight || !s.reps}
                  className={[
                    "shrink-0 rounded-lg border px-3 py-2 text-sm transition",
                    s.done ? "border-slate-600 bg-slate-800/40" : 
                    (!s.weight || !s.reps) ? "border-slate-800 text-slate-600 cursor-not-allowed" :
                    "border-slate-700 hover:bg-slate-800",
                  ].join(' ')}
                  aria-pressed={s.done}
                >
                  ✓
                </button>
              </div>
            ))}

            <div className="pt-2">
              <button onClick={onAddSet} className="text-sm text-slate-200 rounded px-3 py-2 border border-dashed border-slate-700 hover:bg-slate-900/30">+ Add set</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
