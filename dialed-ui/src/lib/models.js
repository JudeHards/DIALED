import { defaultPrescription, workoutSchema } from '@dialed/shared';
export const emptySet = () => ({ id: crypto.randomUUID(), weight: null, reps: null, rir: null, completed: false, warmup: false });
export const routineExercise = exercise => ({ id: crypto.randomUUID(), exerciseId: exercise.id, prescription: defaultPrescription(exercise.equipment) });
export function sessionExercise(exercise, prescription = defaultPrescription(exercise.equipment)) {
  return { id: crypto.randomUUID(), exerciseId: exercise.id, snapshot: structuredClone(exercise), prescription: { ...prescription }, sets: Array.from({ length: prescription.workingSets }, emptySet) };
}
export function newWorkout(routine, catalog) {
  return { id: crypto.randomUUID(), name: routine?.name ?? 'New workout', routineId: routine?.id ?? null, version: 0,
    status: 'in_progress', startedAt: new Date().toISOString(), completedAt: null,
    exercises: routine ? routine.exercises.map(e => sessionExercise(catalog.find(c => c.id === e.exerciseId), e.prescription)) : [] };
}
export function legacyRecords(storage = localStorage) {
  return Object.keys(storage).filter(k => k.startsWith('dialed:pendingWorkout:') || k.startsWith('dialed:lastWorkout:')).map(key => {
    try { return { key, value: JSON.parse(storage.getItem(key)) }; } catch { return { key, error: 'Unreadable JSON; original record is retained.' }; }
  });
}
export function recoverLegacy(record, catalog) {
  const value = record.value;
  if (!value || !Array.isArray(value.exercises)) throw new Error('This older format needs manual recovery. Download it to keep a copy.');
  const workout = newWorkout(null, catalog);
  workout.name = value.name || value.workoutName || 'Recovered workout';
  workout.exercises = value.exercises.map(e => {
    const matches = catalog.filter(c => c.id === e.exerciseId || c.id === e.id || c.name === e.name);
    if (matches.length !== 1) throw new Error(`Cannot match ${e.name || 'an exercise'} to the catalogue. Download the original for manual recovery.`);
    const result = sessionExercise(matches[0]);
    const numeric = n => n === '' || n === null || n === undefined ? null : Number(n);
    result.sets = (e.sets || []).map(s => ({ ...emptySet(), weight: numeric(s.weight), reps: numeric(s.reps), completed: Boolean(s.completed ?? s.done) }));
    result.prescription.workingSets = Math.max(1, result.sets.length);
    return result;
  });
  // Recovery intentionally remains a draft: old records do not reliably encode completion dates.
  return workoutSchema.parse(workout);
}
export function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
