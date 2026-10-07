import { supabase } from './supabase';
const BASE = import.meta.env.VITE_API_URL ?? 'http://localhost:3000';
export class ApiError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}
export async function request(userId, path, opts = {}) {
  const { data: { session } } = await supabase.auth.getSession();
  if (!session || session.user.id !== userId) throw new ApiError(401, 'Sign in to sync this account’s drafts.');
  const res = await fetch(`${BASE}/api${path}`, {
    ...opts, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new ApiError(res.status, body.error ?? `Request failed (${res.status})`);
  }
  return res.status === 204 ? null : res.json();
}
export function apiFor(userId) {
  const get = path => request(userId, path);
  const write = (path, body, method = 'PUT') => request(userId, path, { method, body: JSON.stringify(body) });
  return {
    exercises: () => get('/exercises'), routines: () => get('/routines'), workouts: () => get('/workouts'),
    workout: id => get(`/workouts/${id}`), profile: () => get('/profile'),
    saveProfile: timezone => write('/profile', { timezone }),
    saveRoutine: routine => write(`/routines/${routine.id}`, { routine, expectedVersion: routine.version, mutationId: crypto.randomUUID() }),
    deleteRoutine: routine => write(`/routines/${routine.id}`, { expectedVersion: routine.version }, 'DELETE'),
    saveWorkout: payload => write(`/workouts/${payload.workout.id}${payload.workout.status === 'completed' ? '/complete' : ''}`, payload, payload.workout.status === 'completed' ? 'POST' : 'PUT'),
    recommendation: (id, exerciseId) => get(`/workouts/${id}/exercises/${exerciseId}/recommendation`),
    explain: (id, exerciseId) => write(`/workouts/${id}/exercises/${exerciseId}/explanation`, {}, 'POST'),
  };
}
