import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { readFile, readdir, mkdtemp, rm } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { exercises, type Routine, type Workout } from '@dialed/shared';
import { bench, routine, userA, userB, workout } from './fixtures';

// Run the production SQL, with only Supabase's auth schema supplied by the harness.
// SET ROLE means these checks exercise PostgreSQL RLS, not a mocked ownership filter.
describe.sequential('production persistence migration', () => {
  let db: PGlite;
  let directory: string;
  beforeAll(async () => {
    directory = await mkdtemp(join(tmpdir(), 'dialed-postgres-'));
    db = new PGlite(directory);
    await db.exec(`
      create role anon;
      create role authenticated;
      create schema auth;
      create table auth.users (id uuid primary key);
      create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
      grant usage on schema public, auth to authenticated, anon;
      grant execute on function auth.uid() to authenticated, anon;
    `);
    await db.query('insert into auth.users(id) values ($1), ($2)', [userA, userB]);
    for (const migration of (await readdir(resolve('../supabase/migrations'))).filter(name => name.endsWith('.sql')).sort()) {
      await db.exec(await readFile(resolve('../supabase/migrations', migration), 'utf8'));
    }
    await db.exec(await readFile(resolve('../supabase/seed.sql'), 'utf8'));
  }, 30_000);
  afterAll(async () => { await db?.close(); if (directory) await rm(directory, { recursive: true, force: true }); });

  async function asUser<T>(user: string, action: () => Promise<T>): Promise<T> {
    await db.query("select set_config('request.jwt.claim.sub', $1, false)", [user]);
    await db.exec('set role authenticated');
    try { return await action(); } finally { await db.exec('reset role'); }
  }
  async function saveWorkout(document: Workout, mutationId = randomUUID(), user = userA) {
    return asUser(user, async () => (await db.query<{ result: Workout }>('select public.save_workout($1::jsonb, $2, $3) as result', [JSON.stringify(document), document.version, mutationId])).rows[0].result);
  }
  async function saveRoutine(document: Routine, mutationId = randomUUID(), user = userA) {
    return asUser(user, async () => (await db.query<{ result: Routine }>('select public.save_routine($1::jsonb, $2, $3) as result', [JSON.stringify(document), document.version, mutationId])).rows[0].result);
  }
  async function getWorkout(id: string, user = userA) {
    return asUser(user, async () => (await db.query<{ result: Workout | null }>('select public.workout_document($1) as result', [id])).rows[0].result);
  }

  it('seeds the full catalogue and persists numeric values, completion flags and muscle snapshots', async () => {
    expect((await asUser(userA, () => db.query('select id from public.exercises'))).rows.map(row => row.id).sort()).toEqual(exercises.map(exercise => exercise.id).sort());
    const draft = workout();
    draft.exercises[0].sets[0] = { ...draft.exercises[0].sets[0], weight: 0, reps: 8, rir: 0 };
    const saved = await saveWorkout(draft);
    expect(saved).toEqual({ ...draft, version: 1 });
    expect(await getWorkout(saved.id)).toEqual(saved);
    expect((await db.query('select * from public.exercise_sets where session_exercise_id = $1', [draft.exercises[0].id])).rows).toHaveLength(3);
  });

  it('retries are idempotent and conflicting or reused mutation IDs never overwrite a saved draft', async () => {
    const draft = workout(); const mutationId = randomUUID();
    const saved = await saveWorkout(draft, mutationId);
    expect(await saveWorkout(draft, mutationId)).toEqual(saved);
    await expect(saveWorkout({ ...draft, name: 'Changed replay' }, mutationId)).rejects.toMatchObject({ code: 'PT409' });
    await expect(saveWorkout({ ...draft, name: 'Stale device' })).rejects.toMatchObject({ code: 'PT409' });
    const updated = await saveWorkout({ ...saved, name: 'My new name' });
    expect(updated.version).toBe(2);
    expect((await getWorkout(saved.id))?.name).toBe('My new name');
  });

  it('finishing updates one session, is replayable, and makes history immutable', async () => {
    const saved = await saveWorkout(workout());
    const complete = { ...saved, status: 'completed' as const, completedAt: '2026-10-07T11:00:00.000Z' };
    const mutationId = randomUUID();
    const finished = await saveWorkout(complete, mutationId);
    expect(finished.version).toBe(2);
    expect(finished.exercises[0].sets.every(s => s.completed)).toBe(true);
    expect(await saveWorkout(complete, mutationId)).toEqual(finished);
    await expect(saveWorkout({ ...finished, name: 'Changed history' })).rejects.toMatchObject({ code: '22023' });
    expect((await db.query('select id from workouts where id = $1', [saved.id])).rows).toHaveLength(1);
  });

  it('RLS isolates parents, children, profiles and document RPCs between accounts', async () => {
    const saved = await saveWorkout(workout());
    const savedRoutine = await saveRoutine(routine());
    await asUser(userA, () => db.query('insert into profiles(user_id, timezone) values ($1, $2)', [userA, 'Europe/Dublin']));
    expect(await getWorkout(saved.id, userB)).toBeNull();
    for (const [table, column, id] of [
      ['workouts', 'id', saved.id], ['session_exercises', 'workout_id', saved.id], ['exercise_sets', 'session_exercise_id', saved.exercises[0].id],
      ['routines', 'id', savedRoutine.id], ['routine_exercises', 'routine_id', savedRoutine.id], ['profiles', 'user_id', userA],
    ]) {
      expect((await asUser(userB, () => db.query(`select * from public.${table} where ${column} = $1`, [id]))).rows).toEqual([]);
    }
    await expect(saveWorkout(saved, randomUUID(), userB)).rejects.toMatchObject({ code: '42501' });
    await expect(saveRoutine(savedRoutine, randomUUID(), userB)).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(userB, () => db.query('insert into profiles(user_id, timezone) values ($1, $2)', [userA, 'UTC']))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(userB, () => db.query("update workouts set name='not mine' where id=$1", [saved.id]))).rejects.toMatchObject({ code: '42501' });
    await expect(asUser(userB, () => db.query('select * from mutations'))).rejects.toMatchObject({ code: '42501' });
    await expect(saveWorkout(workout({ routineId: savedRoutine.id }), randomUUID(), userB)).rejects.toMatchObject({ code: '42501' });
  });

  it('rejects unauthenticated calls and prevents anonymous catalogue access', async () => {
    await expect(saveWorkout(workout(), randomUUID(), '')).rejects.toMatchObject({ code: '42501' });
    await db.exec('set role anon');
    try { await expect(db.query('select * from exercises')).rejects.toMatchObject({ code: '42501' }); }
    finally { await db.exec('reset role'); }
  });

  it('keeps routine prescriptions separate from sessions after edits and deletion', async () => {
    const savedRoutine = await saveRoutine(routine());
    const saved = await saveWorkout(workout({ routineId: savedRoutine.id }));
    const edit = structuredClone(savedRoutine); edit.exercises[0].prescription.repMax = 15;
    const updatedRoutine = await saveRoutine(edit);
    expect((await getWorkout(saved.id))?.exercises[0].prescription.repMax).toBe(12);
    await expect(asUser(userA, () => db.query('select delete_routine($1, $2)', [updatedRoutine.id, 1]))).rejects.toMatchObject({ code: 'PT409' });
    await asUser(userA, () => db.query('select delete_routine($1, $2)', [updatedRoutine.id, updatedRoutine.version]));
    expect((await getWorkout(saved.id))?.routineId).toBeNull();
    // An offline draft may still carry the deleted template ID; it must remain saveable.
    expect((await saveWorkout({ ...saved, name: 'Still logging' })).routineId).toBeNull();
  });

  it('takes authoritative muscle snapshots and preserves them across catalogue changes', async () => {
    const draft = workout(); draft.exercises[0].snapshot.primaryMuscle = 'core';
    const saved = await saveWorkout(draft);
    expect(saved.exercises[0].snapshot.primaryMuscle).toBe('chest');
    await db.query("update exercises set data = jsonb_set(data, '{primaryMuscle}', '\"shoulders\"') where id = $1", [bench.id]);
    try {
      const updated = await saveWorkout(saved);
      expect(updated.exercises[0].snapshot.primaryMuscle).toBe('chest');
      expect((await saveWorkout(workout())).exercises[0].snapshot.primaryMuscle).toBe('shoulders');
    } finally { await db.query('update exercises set data = $1::jsonb where id = $2', [JSON.stringify(bench), bench.id]); }
  });

  it('rolls back the entire document when a set or prescription is invalid', async () => {
    const saved = await saveWorkout(workout());
    for (const change of [
      (w: Workout) => { w.exercises[0].sets[1].weight = -1; },
      (w: Workout) => { w.exercises[0].sets[1].reps = 2.5; },
      (w: Workout) => { w.exercises[0].sets[1].rir = 11; },
      (w: Workout) => { w.exercises[0].sets[1].weight = null; },
      (w: Workout) => { w.exercises[0].prescription.repMin = 20; },
      (w: Workout) => { w.exercises.push(structuredClone(w.exercises[0])); },
      (w: Workout) => { w.startedAt = '2026-10-06T10:00:00.000Z'; },
    ]) {
      const invalid = structuredClone(saved); invalid.name = 'Must roll back'; change(invalid);
      await expect(saveWorkout(invalid)).rejects.toThrow();
      expect(await getWorkout(saved.id)).toEqual(saved);
    }
    await expect(asUser(userA, () => db.query('select save_workout($1::jsonb, $2, $3)', [JSON.stringify(saved), 0, randomUUID()]))).rejects.toMatchObject({ code: '22023' });
  });

  it('cannot steal exercise/set IDs or complete an empty session', async () => {
    const saved = await saveWorkout(workout());
    const stolenExercise = workout(); stolenExercise.exercises[0].id = saved.exercises[0].id;
    await expect(saveWorkout(stolenExercise, randomUUID(), userB)).rejects.toMatchObject({ code: '22023' });
    const stolenSet = workout(); stolenSet.exercises[0].sets[0].id = saved.exercises[0].sets[0].id;
    await expect(saveWorkout(stolenSet, randomUUID(), userB)).rejects.toMatchObject({ code: '23505' });
    await expect(saveWorkout(workout({ status: 'completed', completedAt: '2026-10-07T11:00:00.000Z', exercises: [] }))).rejects.toMatchObject({ code: '22023' });
    expect(await getWorkout(saved.id)).toEqual(saved);
  });

  it('persists history and the retry ledger across a database restart', async () => {
    const draft = workout(); const mutationId = randomUUID();
    const saved = await saveWorkout(draft, mutationId);
    await db.close();
    db = new PGlite(directory);
    expect(await getWorkout(saved.id)).toEqual(saved);
    expect(await saveWorkout(draft, mutationId)).toEqual(saved);
  }, 20_000);
});
