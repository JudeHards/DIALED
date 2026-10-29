import 'fake-indexeddb/auto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { exercises } from '@dialed/shared';
import { database, cached, draft, drafts, discardAbandoned, discardDraft, mergeRemote, recoveries, saveDraft, separateCopy, syncDrafts, adoptCloudVersion } from '../src/lib/offline';
import { newWorkout, sessionExercise } from '../src/lib/models';

function fixture() {
  const workout = newWorkout(null, exercises);
  workout.exercises = [sessionExercise(exercises[0])];
  workout.exercises[0].sets = workout.exercises[0].sets.map(set => ({ ...set, weight: 50, reps: 10, completed: true }));
  return workout;
}
function deferred() {
  let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve };
}
function storageApi() {
  const records = new Map(); const receipts = new Map();
  return {
    records, receipts,
    saveWorkout: vi.fn(async payload => {
      if (receipts.has(payload.mutationId)) return structuredClone(receipts.get(payload.mutationId));
      const previous = records.get(payload.workout.id);
      if ((previous?.version ?? 0) !== payload.expectedVersion) throw Object.assign(new Error('Version conflict'), { status: 409 });
      const saved = { ...structuredClone(payload.workout), version: payload.expectedVersion + 1 };
      records.set(saved.id, saved); receipts.set(payload.mutationId, saved); return structuredClone(saved);
    }),
    workout: vi.fn(async id => structuredClone(records.get(id))),
    deleteWorkout: vi.fn(async (id, expectedVersion) => {
      const previous = records.get(id);
      if (!previous) return null;
      if (previous.status !== 'in_progress') throw Object.assign(new Error('Completed'), { status: 400 });
      if (previous.version !== expectedVersion) throw Object.assign(new Error('Version conflict'), { status: 409 });
      records.delete(id); return null;
    }),
  };
}
beforeEach(async () => {
  const db = await database();
  await Promise.all(['drafts', 'cache', 'recovery'].map(store => db.clear(store)));
  vi.spyOn(console, 'info').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

describe('device drafts and replay', () => {
  it('saves actual performance and muscle snapshots, and restores after reopening the database', async () => {
    const workout = fixture(); workout.exercises[0].sets[0].weight = 0;
    await saveDraft('alice', workout);
    const reopened = await indexedDB.databases();
    expect(reopened.some(db => db.name === 'dialed-v2')).toBe(true);
    expect((await draft('alice', workout.id)).workout).toEqual(workout);
    const api = storageApi(); await syncDrafts('alice', api);
    expect((await draft('alice', workout.id)).state).toBe('synced');
    expect(api.records.get(workout.id).exercises[0].snapshot).toEqual(exercises[0]);
    expect(api.records.get(workout.id).exercises[0].sets[0].weight).toBe(0);
  });
  it('keeps queues, caches, and recovered copies isolated between accounts', async () => {
    const workout = fixture();
    await saveDraft('alice', workout); await saveDraft('bob', { ...workout, name: 'Bob’s session' });
    await cached('alice', 'routines', ['private']);
    const api = storageApi(); await syncDrafts('bob', api);
    expect(api.saveWorkout).toHaveBeenCalledTimes(1);
    expect(api.records.get(workout.id).name).toBe('Bob’s session');
    expect((await drafts('alice'))[0].state).toBe('pending');
    expect(await cached('bob', 'routines')).toBeUndefined();
    expect(await recoveries('bob')).toEqual([]);
    await expect(saveDraft('', workout)).rejects.toThrow('Sign in');
  });
  it('replays exactly the same mutation when the server committed but its response was lost', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); const save = api.saveWorkout;
    api.saveWorkout = vi.fn(async payload => { const result = await save(payload); if (api.saveWorkout.mock.calls.length === 1) throw new TypeError('Network lost'); return result; });
    await syncDrafts('alice', api);
    const pending = (await draft('alice', workout.id)).pending;
    expect(pending).toBeTruthy();
    await syncDrafts('alice', api);
    expect(api.saveWorkout.mock.calls[0][0]).toEqual(api.saveWorkout.mock.calls[1][0]);
    expect(api.receipts.size).toBe(1);
    expect((await draft('alice', workout.id)).workout.version).toBe(1);
    expect((await draft('alice', workout.id)).state).toBe('synced');
  });
  it('drains edits and completion made during an in-flight save without losing the latest data', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const started = deferred(); const response = deferred(); const api = storageApi(); const save = api.saveWorkout;
    api.saveWorkout = vi.fn(async payload => {
      if (api.saveWorkout.mock.calls.length === 1) { started.resolve(); await response.promise; }
      return save(payload);
    });
    const syncing = syncDrafts('alice', api); await started.promise;
    const updated = structuredClone(workout);
    updated.exercises[0].sets[0].weight = 55;
    updated.status = 'completed'; updated.completedAt = new Date().toISOString();
    await saveDraft('alice', updated); response.resolve(); await syncing;
    const row = await draft('alice', workout.id);
    expect(row.state).toBe('synced'); expect(row.workout.version).toBe(2);
    expect(row.workout.status).toBe('completed'); expect(row.workout.exercises[0].sets[0].weight).toBe(55);
    expect(api.saveWorkout.mock.calls[1][0].expectedVersion).toBe(1);
    expect(api.saveWorkout.mock.calls[0][0].mutationId).not.toBe(api.saveWorkout.mock.calls[1][0].mutationId);
  });
  it('deduplicates overlapping sync triggers for an account', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const response = deferred(); const api = { saveWorkout: vi.fn(async payload => { await response.promise; return { ...payload.workout, version: 1 }; }) };
    const first = syncDrafts('alice', api); const second = syncDrafts('alice', api);
    expect(second).toBe(first); response.resolve(); await Promise.all([first, second]);
    expect(api.saveWorkout).toHaveBeenCalledTimes(1);
  });
  it('retains the exact pending mutation on expired authentication and later resumes', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); const save = api.saveWorkout;
    api.saveWorkout = vi.fn().mockRejectedValueOnce(Object.assign(new Error('Sign in again'), { status: 401 })).mockImplementation(save);
    await syncDrafts('alice', api); expect((await draft('alice', workout.id)).state).toBe('pending');
    await syncDrafts('alice', api);
    expect(api.saveWorkout.mock.calls[0][0]).toEqual(api.saveWorkout.mock.calls[1][0]);
    expect((await draft('alice', workout.id)).state).toBe('synced');
  });
  it('retains conflicts, prevents remote refresh overwriting them, and archives the local copy before recovery', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); const cloud = { ...workout, name: 'Cloud version', version: 2 };
    api.records.set(workout.id, cloud);
    await syncDrafts('alice', api); await mergeRemote('alice', [cloud]);
    const conflict = await draft('alice', workout.id);
    expect(conflict.state).toBe('conflict'); expect(conflict.workout.name).toBe(workout.name);
    await syncDrafts('alice', api); expect(api.saveWorkout).toHaveBeenCalledTimes(1);
    expect(await adoptCloudVersion('alice', workout.id, api)).toEqual(cloud);
    expect((await recoveries('alice'))[0].workout).toEqual(workout);
    expect(await recoveries('bob')).toEqual([]);
    expect((await draft('alice', workout.id)).state).toBe('synced');
  });
  it('keeps newer local data and server versions when stale cloud lists arrive', async () => {
    const workout = fixture(); await mergeRemote('alice', [{ ...workout, version: 3 }]);
    await mergeRemote('alice', [{ ...workout, name: 'stale', version: 2 }]);
    expect((await draft('alice', workout.id)).workout.name).toBe(workout.name);
    await saveDraft('alice', { ...workout, name: 'editing', version: 0 });
    await mergeRemote('alice', [{ ...workout, name: 'remote', version: 4 }]);
    const row = await draft('alice', workout.id);
    expect(row.workout.name).toBe('editing'); expect(row.serverVersion).toBe(3); expect(row.workout.version).toBe(3);
  });
  it('does not send invalid completed sets and retries after the user corrects them', async () => {
    const workout = fixture(); workout.exercises[0].sets[0].reps = null;
    await saveDraft('alice', workout); const api = storageApi(); await syncDrafts('alice', api);
    expect(api.saveWorkout).not.toHaveBeenCalled(); expect((await draft('alice', workout.id)).state).toBe('invalid');
    workout.exercises[0].sets[0].reps = 8; await saveDraft('alice', workout); await syncDrafts('alice', api);
    expect((await draft('alice', workout.id)).state).toBe('synced');
  });
  it('creates independent IDs and data for recovered sessions', () => {
    const workout = fixture(); const copy = separateCopy(workout);
    expect(copy.id).not.toBe(workout.id); expect(copy.exercises[0].id).not.toBe(workout.exercises[0].id);
    expect(copy.exercises[0].sets[0].id).not.toBe(workout.exercises[0].sets[0].id);
    copy.exercises[0].snapshot.name = 'Edited snapshot';
    expect(workout.exercises[0].snapshot.name).toBe(exercises[0].name);
  });
});

describe('discarding sessions', () => {
  it('hides a discarded session at once, deletes the server copy at its version, then the device copy', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); await syncDrafts('alice', api);
    await discardDraft('alice', workout.id);
    expect(await drafts('alice')).toEqual([]);
    expect((await draft('alice', workout.id)).state).toBe('discarded');
    await syncDrafts('alice', api);
    expect(api.deleteWorkout).toHaveBeenCalledWith(workout.id, 1);
    expect(api.records.has(workout.id)).toBe(false);
    expect(await draft('alice', workout.id)).toBeUndefined();
  });
  it('removes a session that never reached the server without sending anything', async () => {
    const workout = fixture(); await saveDraft('alice', workout); await discardDraft('alice', workout.id);
    const api = storageApi(); await syncDrafts('alice', api);
    expect(api.saveWorkout).not.toHaveBeenCalled(); expect(api.deleteWorkout).not.toHaveBeenCalled();
    expect(await draft('alice', workout.id)).toBeUndefined();
  });
  it('replays a save whose response was lost, then deletes at the version it created', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); const save = api.saveWorkout;
    api.saveWorkout = vi.fn(async payload => { const result = await save(payload); if (api.saveWorkout.mock.calls.length === 1) throw new TypeError('Network lost'); return result; });
    await syncDrafts('alice', api);
    await discardDraft('alice', workout.id); await syncDrafts('alice', api);
    expect(api.saveWorkout.mock.calls[1][0]).toEqual(api.saveWorkout.mock.calls[0][0]);
    expect(api.deleteWorkout).toHaveBeenCalledWith(workout.id, 1);
    expect(api.records.size).toBe(0); expect(await draft('alice', workout.id)).toBeUndefined();
  });
  it('retries after going offline and keeps the session for review if another device logged to it', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const api = storageApi(); await syncDrafts('alice', api);
    await discardDraft('alice', workout.id);
    const remove = api.deleteWorkout;
    api.deleteWorkout = vi.fn().mockRejectedValueOnce(new TypeError('Offline')).mockImplementation(remove);
    await syncDrafts('alice', api);
    expect((await draft('alice', workout.id)).state).toBe('discarded');
    api.records.set(workout.id, { ...api.records.get(workout.id), name: 'Logged on phone', version: 2 });
    await syncDrafts('alice', api);
    expect(api.records.get(workout.id).name).toBe('Logged on phone');
    const row = await draft('alice', workout.id);
    expect(row.state).toBe('conflict'); expect(row.error).toContain('another device');
    expect(await drafts('alice')).toHaveLength(1);
  });
  it('saves workouts even while a deletion keeps failing', async () => {
    const junk = fixture(); const real = fixture();
    await saveDraft('alice', junk); const api = storageApi(); await syncDrafts('alice', api);
    await discardDraft('alice', junk.id); await saveDraft('alice', real);
    api.deleteWorkout = vi.fn(async () => { throw Object.assign(new Error('Storage is temporarily unavailable'), { status: 503 }); });
    await syncDrafts('alice', api); await syncDrafts('alice', api);
    expect((await draft('alice', real.id)).state).toBe('synced');
    expect((await draft('alice', junk.id)).state).toBe('discarded');
    expect(api.deleteWorkout).toHaveBeenCalledTimes(2);
  });
  it('restores a discarded session when it is edited before the deletion is sent', async () => {
    const workout = fixture(); await saveDraft('alice', workout); await discardDraft('alice', workout.id);
    await saveDraft('alice', { ...workout, name: 'Still training' });
    const api = storageApi(); await syncDrafts('alice', api);
    expect(api.deleteWorkout).not.toHaveBeenCalled();
    expect((await draft('alice', workout.id))).toMatchObject({ state: 'synced', workout: { name: 'Still training' } });
  });
  it('deletes at the new version when discarded during an in-flight save', async () => {
    const workout = fixture(); await saveDraft('alice', workout);
    const started = deferred(); const response = deferred(); const api = storageApi(); const save = api.saveWorkout;
    api.saveWorkout = vi.fn(async payload => { started.resolve(); await response.promise; return save(payload); });
    const syncing = syncDrafts('alice', api); await started.promise;
    await discardDraft('alice', workout.id); response.resolve(); await syncing;
    expect(await draft('alice', workout.id)).toMatchObject({ state: 'discarded', serverVersion: 1, pending: null });
    await syncDrafts('alice', api);
    expect(api.deleteWorkout).toHaveBeenCalledWith(workout.id, 1);
    expect(await draft('alice', workout.id)).toBeUndefined();
  });
  it('drops unfinished sessions another device discarded, but not unsynced, newly synced or completed ones', async () => {
    const gone = fixture(); const local = fixture(); const late = fixture();
    const finished = { ...fixture(), status: 'completed', completedAt: new Date().toISOString() };
    await mergeRemote('alice', [{ ...gone, version: 1 }, { ...finished, version: 2 }]);
    await saveDraft('alice', local);
    const settled = new Set([...(await drafts('alice')).filter(row => row.state === 'synced').map(row => row.id), local.id]);
    await mergeRemote('alice', [{ ...late, version: 1 }]);
    await mergeRemote('alice', [], settled);
    expect((await drafts('alice')).map(row => row.id).sort()).toEqual([local.id, late.id, finished.id].sort());
  });
  it('discards abandoned empty sessions and never ones with entered sets', async () => {
    const logged = { ...fixture(), startedAt: new Date(Date.now() - 86400000).toISOString() };
    const empty = newWorkout(null, exercises); empty.exercises = [sessionExercise(exercises[0])];
    await saveDraft('alice', logged); await saveDraft('alice', empty);
    expect(await discardAbandoned('alice')).toBe(1);
    expect((await drafts('alice')).map(row => row.id)).toEqual([logged.id]);
    expect(await discardAbandoned('alice')).toBe(0);
  });
});
