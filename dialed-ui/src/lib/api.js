const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';

async function request(path, opts = {}) {
  const url = `${BASE}${path}`;
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...opts,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`API ${res.status} ${res.statusText}: ${text}`);
  }
  return res.status === 204 ? null : res.json();
}

export const createWorkout = async (payload) =>
  request('/api/workouts', { method: 'POST', body: JSON.stringify(payload) });

export const getWorkouts = async () => request('/api/workouts');

export const getWorkout = async (id) => request(`/api/workouts/${id}`);

export const getExercises = async () => request('/api/exercises');

export const getExercise = async (id) => request(`/api/exercises/${id}`);

export const updateWorkout = async (id, payload) =>
  request(`/api/workouts/${id}`, { method: 'PUT', body: JSON.stringify(payload) });

export const startWorkout = async (id) =>
  request(`/api/workouts/${id}/start`, { method: 'POST' });

export const updateExerciseSet = async (workoutId, exerciseId, setIndex, body) =>
  request(`/api/workouts/${workoutId}/exercises/${exerciseId}/sets/${setIndex}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  });

export default { createWorkout, getWorkouts, getWorkout, startWorkout, updateExerciseSet, getExercises, getExercise, updateWorkout };
