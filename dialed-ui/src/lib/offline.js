import { openDB } from 'idb';
import { workoutSchema } from '@dialed/shared';

let dbPromise;
export function database() {
  return dbPromise ??= openDB('dialed-v2', 1, {
    upgrade(db) {
      db.createObjectStore('drafts', { keyPath: ['userId', 'id'] }).createIndex('user', 'userId');
      db.createObjectStore('cache', { keyPath: ['userId', 'key'] });
      db.createObjectStore('recovery', { keyPath: ['userId', 'id'] });
    },
    blocking() { dbPromise?.then(db => db.close()); dbPromise = undefined; },
    terminated() { dbPromise = undefined; },
  });
}
function requireUser(userId) {
  if (!userId) throw new Error('Sign in before saving a workout to this device.');
}
function changed(userId) {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent('dialed:changed', { detail: { userId } }));
}
export async function cached(userId, key, value) {
  requireUser(userId);
  const db = await database();
  if (value !== undefined) {
    await db.put('cache', { userId, key, value }); changed(userId); return value;
  }
  return (await db.get('cache', [userId, key]))?.value;
}
export async function drafts(userId) {
  requireUser(userId); return (await database()).getAllFromIndex('drafts', 'user', userId);
}
export async function draft(userId, id) {
  requireUser(userId); return (await database()).get('drafts', [userId, id]);
}
export async function saveDraft(userId, workout) {
  requireUser(userId);
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  const old = await tx.store.get([userId, workout.id]);
  const serverVersion = old?.serverVersion ?? workout.version;
  const next = {
    ...old, userId, id: workout.id, workout: { ...workout, version: serverVersion }, serverVersion,
    revision: (old?.revision ?? 0) + 1,
    state: old?.state === 'conflict' ? 'conflict' : 'pending',
    error: old?.state === 'conflict' ? old.error : null,
  };
  await tx.store.put(next); await tx.done; changed(userId); return next;
}
export async function mergeRemote(userId, workouts) {
  requireUser(userId);
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  for (const workout of workouts) {
    const old = await tx.store.get([userId, workout.id]);
    if (!old || (old.state === 'synced' && workout.version >= old.serverVersion)) {
      await tx.store.put({ userId, id: workout.id, workout, serverVersion: workout.version, revision: old?.revision ?? 0, state: 'synced', error: null });
    }
  }
  await tx.done; changed(userId);
}
async function updateRecord(userId, id, fn) {
  const db = await database(); const tx = db.transaction('drafts', 'readwrite');
  const row = await tx.store.get([userId, id]);
  const next = row ? fn(row) : undefined;
  if (next) await tx.store.put(next);
  await tx.done; changed(userId); return next;
}
const running = new Map();
const blockedStates = new Set(['synced', 'conflict', 'invalid']);
export function syncDrafts(userId, api) {
  requireUser(userId);
  if (running.has(userId)) return running.get(userId);
  const run = async () => {
    for (const row of await drafts(userId)) {
      // Drain edits made while a request was in flight, including completion. Bound
      // each pass so continuous typing cannot monopolize the background worker.
      for (let attempt = 0; attempt < 20; attempt += 1) {
        let batch;
        await updateRecord(userId, row.id, current => {
          if (blockedStates.has(current.state)) return current;
          if (current.pending) { batch = current.pending; return current; }
          const parsed = workoutSchema.safeParse({ ...current.workout, version: current.serverVersion });
          if (!parsed.success) return { ...current, state: 'invalid', error: parsed.error.issues.map(i => i.message).join('; ') };
          batch = { mutationId: crypto.randomUUID(), expectedVersion: current.serverVersion, workout: parsed.data, revision: current.revision };
          return { ...current, pending: batch };
        });
        if (!batch) break;
        try {
          const { revision: _revision, ...payload } = batch;
          const saved = workoutSchema.parse(await api.saveWorkout(payload));
          if (saved.id !== row.id || saved.version <= batch.expectedVersion) throw new Error('The server returned an unexpected workout response. Your draft is retained.');
          const next = await updateRecord(userId, row.id, current => {
            if (current.pending?.mutationId !== batch.mutationId) return current;
            const unchanged = current.revision === batch.revision;
            return {
              ...current, workout: unchanged ? saved : { ...current.workout, version: saved.version }, serverVersion: saved.version,
              state: unchanged ? 'synced' : 'pending', pending: null, error: null,
            };
          });
          if (!next || next.state !== 'pending') break;
        } catch (error) {
          await updateRecord(userId, row.id, current => {
            if (current.pending?.mutationId !== batch.mutationId) return current;
            const rejected = error.status === 400 || error.status === 404 || error.status === 413 || error.status === 422;
            return {
              ...current,
              state: error.status === 409 ? 'conflict' : rejected ? 'invalid' : 'pending',
              error: error.status === 409 ? 'This workout changed on another device. Your local version is retained.' : error.message,
              // An uncertain response must replay the exact same mutation and body.
              pending: rejected ? null : current.pending,
            };
          });
          console.info(JSON.stringify({ event: 'sync_failure', status: error.status ?? 'offline' }));
          if (!error.status || error.status === 401 || error.status === 429 || error.status >= 500) return;
          break;
        }
      }
    }
  };
  const promise = (typeof navigator !== 'undefined' && navigator.locks
    ? navigator.locks.request(`dialed-sync:${userId}`, run) : run()).finally(() => running.delete(userId));
  running.set(userId, promise); return promise;
}
export async function adoptCloudVersion(userId, id, api) {
  requireUser(userId);
  const remote = workoutSchema.parse(await api.workout(id));
  if (remote.id !== id) throw new Error('The cloud workout could not be verified. Your local copy is retained.');
  const db = await database(); const tx = db.transaction(['drafts', 'recovery'], 'readwrite');
  const row = await tx.objectStore('drafts').get([userId, id]);
  if (row) await tx.objectStore('recovery').put({ userId, id: crypto.randomUUID(), savedAt: new Date().toISOString(), workout: row.workout });
  await tx.objectStore('drafts').put({ userId, id, workout: remote, state: 'synced', serverVersion: remote.version, revision: (row?.revision ?? 0) + 1, error: null });
  await tx.done; changed(userId); return remote;
}
export function separateCopy(workout) {
  return {
    ...structuredClone(workout), id: crypto.randomUUID(), version: 0, name: `${workout.name.slice(0, 108)} (recovered)`,
    exercises: workout.exercises.map(e => ({ ...structuredClone(e), id: crypto.randomUUID(), sets: e.sets.map(s => ({ ...s, id: crypto.randomUUID() })) })),
  };
}
export async function recoveries(userId) {
  requireUser(userId);
  return (await (await database()).getAll('recovery')).filter(row => row.userId === userId);
}
