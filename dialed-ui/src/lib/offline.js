import { openDB } from 'idb';
import { workoutSchema } from '@dialed/shared';
let dbPromise;
export function database() {
  return dbPromise ??= openDB('dialed-v2', 1, { upgrade(db) {
    db.createObjectStore('drafts', { keyPath: ['userId', 'id'] }).createIndex('user', 'userId');
    db.createObjectStore('cache', { keyPath: ['userId', 'key'] });
    db.createObjectStore('recovery', { keyPath: ['userId', 'id'] });
  } });
}
function changed() { if (typeof window !== 'undefined') window.dispatchEvent(new Event('dialed:changed')); }
export async function cached(userId, key, value) {
  const db = await database();
  if (value !== undefined) { await db.put('cache', { userId, key, value }); changed(); return value; }
  return (await db.get('cache', [userId, key]))?.value;
}
export async function drafts(userId) { return (await database()).getAllFromIndex('drafts', 'user', userId); }
export async function draft(userId, id) { return (await database()).get('drafts', [userId, id]); }
export async function saveDraft(userId, workout) {
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  const old = await tx.store.get([userId, workout.id]);
  const next = { ...old, userId, id: workout.id, workout, serverVersion: old?.serverVersion ?? workout.version,
    revision: (old?.revision ?? 0) + 1, state: old?.state === 'conflict' ? 'conflict' : 'pending', error: null };
  await tx.store.put(next); await tx.done; changed(); return next;
}
export async function mergeRemote(userId, workouts) {
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  for (const workout of workouts) {
    const old = await tx.store.get([userId, workout.id]);
    if (!old || (old.state === 'synced' && workout.version >= old.serverVersion)) await tx.store.put({ userId, id: workout.id, workout, serverVersion: workout.version, revision: 0, state: 'synced' });
  }
  await tx.done; changed();
}
async function updateRecord(userId, id, fn) {
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  const row = await tx.store.get([userId, id]);
  if (row) await tx.store.put(fn(row)); await tx.done; changed();
}
const running = new Map();
export function syncDrafts(userId, api) {
  if (running.has(userId)) return running.get(userId);
  const run = async () => {
    for (const row of await drafts(userId)) {
      if (row.state === 'synced' || row.state === 'conflict' || row.state === 'invalid') continue;
      let batch;
      await updateRecord(userId, row.id, current => {
        if (current.state === 'synced' || current.state === 'conflict') return current;
        if (current.pending) { batch = current.pending; return current; }
        const parsed = workoutSchema.safeParse({ ...current.workout, version: current.serverVersion });
        if (!parsed.success) return { ...current, state: 'invalid', error: parsed.error.issues.map(i => i.message).join('; ') };
        batch = { mutationId: crypto.randomUUID(), expectedVersion: current.serverVersion, workout: parsed.data, revision: current.revision };
        return { ...current, pending: batch };
      });
      if (!batch) continue;
      try {
        const { revision: _revision, ...payload } = batch;
        const saved = await api.saveWorkout(payload);
        await updateRecord(userId, row.id, current => {
          if (current.pending?.mutationId !== batch.mutationId) return current;
          const unchanged = current.revision === batch.revision;
          return { ...current, workout: unchanged ? saved : { ...current.workout, version: saved.version }, serverVersion: saved.version,
            state: unchanged ? 'synced' : 'pending', pending: null, error: null };
        });
      } catch (error) {
        await updateRecord(userId, row.id, current => ({ ...current,
          state: error.status === 409 ? 'conflict' : (error.status === 400 || error.status === 404 ? 'invalid' : 'pending'),
          error: error.status === 409 ? 'This workout changed on another device. Your local version is retained.' : error.message,
          // Never alter a request whose response may have been lost. Only definite rejection permits a new payload.
          pending: error.status === 400 || error.status === 404 ? null : current.pending,
        }));
        console.info(JSON.stringify({ event: 'sync_failure', status: error.status ?? 'offline' }));
        if (!error.status || error.status === 401 || error.status >= 500) break;
      }
    }
  };
  const promise = (typeof navigator !== 'undefined' && navigator.locks ? navigator.locks.request(`dialed-sync:${userId}`, run) : run()).finally(() => running.delete(userId));
  running.set(userId, promise); return promise;
}
export async function useCloudVersion(userId, id, api) {
  const remote = await api.workout(id);
  const db = await database(); const tx = db.transaction(['drafts', 'recovery'], 'readwrite');
  const row = await tx.objectStore('drafts').get([userId, id]);
  await tx.objectStore('recovery').put({ userId, id: crypto.randomUUID(), savedAt: new Date().toISOString(), workout: row.workout });
  await tx.objectStore('drafts').put({ userId, id, workout: remote, state: 'synced', serverVersion: remote.version, revision: 0 });
  await tx.done; changed(); return remote;
}
export function separateCopy(workout) {
  return { ...workout, id: crypto.randomUUID(), version: 0, name: `${workout.name.slice(0, 108)} (recovered)`,
    exercises: workout.exercises.map(e => ({ ...e, id: crypto.randomUUID(), sets: e.sets.map(s => ({ ...s, id: crypto.randomUUID() })) })) };
}
export async function recoveries(userId) {
  return (await (await database()).getAll('recovery')).filter(row => row.userId === userId);
}
