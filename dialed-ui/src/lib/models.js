import { defaultPrescription, workoutSchema } from '@dialed/shared';
export const emptySet = () => ({ id: crypto.randomUUID(), weight: null, reps: null, rir: null, completed: false, warmup: false });
export const hasSetValues = set => Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 2000 && Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000;
export const isSetComplete = set => set.completed === true && hasSetValues(set);
// Anything typed into a set is the user's data and is never discarded automatically.
export const hasEnteredSets = workout => workout.exercises.some(exercise => exercise.sets.some(set => [set.weight, set.reps, set.rir].some(value => value != null)));
export const isUntouched = row => !hasEnteredSets(row.workout) && ['synced', 'pending'].includes(row.state);
const abandonedAfterMs = 6 * 60 * 60 * 1000;
// Only one session is resumed: the newest with entered sets, else a recently started empty one.
// Other untouched sessions are abandoned; resuming them would carry a stale start time.
export function inProgress(rows, now = Date.now()) {
  const sessions = rows.filter(row => row.workout.status === 'in_progress').sort((a, b) => b.workout.startedAt.localeCompare(a.workout.startedAt));
  const recent = sessions[0] && now - Date.parse(sessions[0].workout.startedAt) < abandonedAfterMs ? sessions[0] : null;
  const current = sessions.find(row => hasEnteredSets(row.workout)) ?? recent;
  const abandoned = sessions.filter(row => row !== current && isUntouched(row));
  return { current, sessions: sessions.filter(row => !abandoned.includes(row)), abandoned };
}

export function previousWorkout(workout, rows) {
  const exerciseIds = workout.exercises.map(exercise => exercise.exerciseId);
  return rows.filter(row => !['conflict', 'invalid'].includes(row.state)).map(row => row.workout)
    .filter(previous => previous.id !== workout.id && previous.status === 'completed' && previous.completedAt <= workout.startedAt)
    .filter(previous => workout.routineId ? previous.routineId === workout.routineId : !previous.routineId && exerciseIds.length > 0 &&
      previous.exercises.length === exerciseIds.length && previous.exercises.every((exercise, index) => exercise.exerciseId === exerciseIds[index]))
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))[0] ?? null;
}

export function previousSets(workout, exerciseIndex, previous) {
  const exercise = workout.exercises[exerciseIndex];
  const occurrence = workout.exercises.slice(0, exerciseIndex).filter(item => item.exerciseId === exercise.exerciseId).length;
  const source = previous?.exercises.filter(item => item.exerciseId === exercise.exerciseId)[occurrence];
  const positions = { working: 0, warmup: 0 };
  return exercise.sets.map(set => {
    const key = set.warmup ? 'warmup' : 'working';
    const prior = source?.sets.filter(item => item.warmup === set.warmup)[positions[key]++];
    return prior && isSetComplete(prior) ? prior : null;
  });
}
export const routineExercise = exercise => ({ id: crypto.randomUUID(), exerciseId: exercise.id, prescription: defaultPrescription(exercise.equipment) });
export function sessionExercise(exercise, prescription) {
  if (!exercise) throw new Error('This routine contains an unavailable exercise. Edit the routine and select it again.');
  prescription ??= defaultPrescription(exercise.equipment);
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
    result.sets = (e.sets || []).map(s => {
      const set = { ...emptySet(), weight: numeric(s.weight), reps: numeric(s.reps), rir: numeric(s.rir), warmup: Boolean(s.warmup) };
      return { ...set, completed: hasSetValues(set) };
    });
    result.prescription.workingSets = Math.min(20, Math.max(1, result.sets.filter(s => !s.warmup).length));
    return result;
  });
  // Recovery intentionally remains a draft: old records do not reliably encode completion dates.
  return workoutSchema.parse(workout);
}
export function downloadJson(value, name) {
  const url = URL.createObjectURL(new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click(); URL.revokeObjectURL(url);
}
