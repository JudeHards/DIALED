import { supabase } from './supabase';
import { cached } from './offline';

const BASE = (import.meta.env.VITE_API_URL ?? (import.meta.env.PROD ? '' : 'http://localhost:3000')).replace(/\/$/, '');
export class ApiError extends Error {
  constructor(status, message) { super(message); this.name = 'ApiError'; this.status = status; }
}
let refreshing;
async function sessionFor(userId, refresh = false) {
  if (!supabase) throw new ApiError(503, 'The Supabase connection has not been configured.');
  let result;
  if (refresh) {
    refreshing ??= supabase.auth.refreshSession().finally(() => { refreshing = undefined; });
    result = await refreshing;
  } else result = await supabase.auth.getSession();
  if (result.error) throw new ApiError(401, 'Sign in again to sync. Your drafts are saved on this device.');
  const session = result.data?.session;
  if (!session || session.user.id !== userId) throw new ApiError(401, 'Sign in to sync this account’s drafts.');
  return session;
}
export async function request(userId, path, opts = {}) {
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const session = await sessionFor(userId, attempt > 0);
    const res = await fetch(`${BASE}/api${path}`, {
      ...opts,
      headers: { ...opts.headers, 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      signal: opts.signal ?? AbortSignal.timeout(15000),
    });
    if (res.status === 401 && attempt === 0) continue;
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new ApiError(res.status, typeof body.error === 'string' ? body.error : `Request failed (${res.status})`);
    }
    return res.status === 204 ? null : res.json();
  }
}
const routineSaves = new Map();
function serializeRoutine(userId, id, operation) {
  const key = `${userId}:${id}`;
  const previous = routineSaves.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(() => typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(`dialed-routine:${key}`, operation) : operation());
  routineSaves.set(key, next);
  return next.finally(() => { if (routineSaves.get(key) === next) routineSaves.delete(key); });
}
export function apiFor(userId) {
  const get = path => request(userId, path);
  const write = (path, body, method = 'PUT') => request(userId, path, { method, body: JSON.stringify(body) });
  async function saveRoutine(routine) {
    // Keep the request itself on disk before sending it. A timeout may happen
    // after the database committed; changing the mutation ID would then conflict.
    const requested = structuredClone(routine);
    return serializeRoutine(userId, routine.id, async () => {
      const key = `routineMutation:${routine.id}`;
      let stored = await cached(userId, key);
      const original = JSON.stringify(requested);
      if (!stored?.pending && stored?.original === original) return stored.saved;
      if (stored?.pending) {
        let saved;
        try { saved = await write(`/routines/${routine.id}`, stored.pending); }
        catch (error) {
          if ([400, 404, 409, 413, 422].includes(error.status)) await cached(userId, key, null);
          throw error;
        }
        await cached(userId, key, { original: stored.original, saved });
        if (stored.original === original) return saved;
        // The editor has newer changes based on the request whose response was
        // lost. Confirm that request before advancing to the newer version.
        if (requested.version === stored.pending.expectedVersion) requested.version = saved.version;
      }
      const payload = { routine: requested, expectedVersion: requested.version, mutationId: crypto.randomUUID() };
      stored = { pending: payload, original };
      await cached(userId, key, stored);
      try {
        const saved = await write(`/routines/${routine.id}`, payload);
        await cached(userId, key, { original, saved }); return saved;
      } catch (error) {
        if ([400, 404, 409, 413, 422].includes(error.status)) await cached(userId, key, null);
        throw error;
      }
    });
  }
  return {
    exercises: () => get('/exercises'), routines: () => get('/routines'), workouts: () => get('/workouts'),
    workout: id => get(`/workouts/${id}`), profile: () => get('/profile'),
    saveProfile: timezone => write('/profile', { timezone }),
    saveRoutine,
    deleteRoutine: routine => serializeRoutine(userId, routine.id, async () => {
      await write(`/routines/${routine.id}`, { expectedVersion: routine.version }, 'DELETE');
      await cached(userId, `routineMutation:${routine.id}`, null);
    }),
    saveWorkout: payload => write(`/workouts/${payload.workout.id}${payload.workout.status === 'completed' ? '/complete' : ''}`, payload, payload.workout.status === 'completed' ? 'POST' : 'PUT'),
    recommendation: (id, exerciseId) => get(`/workouts/${id}/exercises/${exerciseId}/recommendation`),
    explain: (id, exerciseId) => write(`/workouts/${id}/exercises/${exerciseId}/explanation`, {}, 'POST'),
    weeklySummary: () => get('/summary/weekly'),
  };
}
