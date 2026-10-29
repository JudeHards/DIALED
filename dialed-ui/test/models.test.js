import { describe, expect, it } from 'vitest';
import { exercises } from '@dialed/shared';
import { legacyRecords, newWorkout, recoverLegacy, routineExercise, sessionExercise, previousWorkout, previousSets, isSetComplete, hasEnteredSets, inProgress } from '../src/lib/models';

describe('routine and session models', () => {
  it('starts independent sessions without modifying a reusable routine or catalogue', () => {
    const routine = { id: crypto.randomUUID(), name: 'Training plan', exercises: [routineExercise(exercises[0])] };
    const first = newWorkout(routine, exercises); const second = newWorkout(routine, exercises);
    expect(first.routineId).toBe(routine.id);
    expect(first.id).not.toBe(second.id);
    expect(first.exercises[0].id).not.toBe(second.exercises[0].id);
    first.exercises[0].prescription.repMax = 20;
    first.exercises[0].snapshot.name = 'Custom'; first.exercises[0].sets[0].weight = 75;
    expect(routine.exercises[0].prescription.repMax).toBe(12);
    expect(second.exercises[0].snapshot.name).toBe(exercises[0].name);
    expect(second.exercises[0].sets[0].weight).toBeNull();
  });
  it('uses three working sets and equipment increments, preserving muscle metadata', () => {
    const dumbbell = exercises.find(exercise => exercise.equipment === 'dumbbell');
    const value = sessionExercise(dumbbell);
    expect(value.prescription).toEqual({ workingSets: 3, repMin: 8, repMax: 12, incrementKg: 1 });
    expect(value.sets).toHaveLength(3);
    expect(value.snapshot.primaryMuscle).toBe(dumbbell.primaryMuscle);
    expect(value.snapshot.secondaryMuscles).toEqual(dumbbell.secondaryMuscles);
    expect(value.snapshot.muscleTargets).toEqual(dumbbell.muscleTargets);
  });
  it('copies head bias into independent session snapshots', () => {
    const incline = exercises.find(exercise => exercise.id === 'ex_incline_db');
    const first = sessionExercise(incline);
    const second = sessionExercise(incline);
    const part = first.snapshot.muscleTargets.find(target => target.part === 'pectoralis_clavicular');
    expect(part.emphasis).toBe('biased');
    part.emphasis = 'shared';
    expect(second.snapshot.muscleTargets.find(target => target.part === part.part).emphasis).toBe('biased');
    expect(incline.muscleTargets.find(target => target.part === part.part).emphasis).toBe('biased');
  });
  it('explains unavailable catalogue exercises before any partial session is created', () => {
    expect(() => newWorkout({ id: crypto.randomUUID(), name: 'Old', exercises: [{ exerciseId: 'missing' }] }, exercises)).toThrow('unavailable exercise');
  });
});
describe('reviewed legacy recovery', () => {
  it('reads earlier records without modifying original local storage', () => {
    const values = { 'dialed:pendingWorkout:old': '{"name":"Old session"}', 'dialed:lastWorkout:bad': '{broken', other: 'untouched' };
    const storage = { ...values }; Object.defineProperty(storage, 'getItem', { value: key => values[key] });
    const records = legacyRecords(storage);
    expect(records).toHaveLength(2); expect(records[1].error).toContain('retained'); expect(values.other).toBe('untouched');
  });
  it('preserves zero-weight sets, warm-ups and effort while requiring review as an editable draft', () => {
    const record = { value: { name: 'Old session', exercises: [{ name: exercises[0].name, sets: [{ weight: '0', reps: '12', rir: '2', done: true, warmup: true }, { weight: '50', reps: '10', done: true }] }] } };
    const recovered = recoverLegacy(record, exercises);
    expect(recovered.status).toBe('in_progress'); expect(recovered.completedAt).toBeNull();
    expect(recovered.exercises[0].sets[0]).toMatchObject({ weight: 0, reps: 12, rir: 2, warmup: true, completed: true });
    expect(recovered.exercises[0].prescription.workingSets).toBe(1);
    expect(record.value.exercises[0].sets[0].weight).toBe('0');
  });
  it('rejects ambiguous or unknown exercises rather than assigning incorrect muscles', () => {
    expect(() => recoverLegacy({ value: { exercises: [{ name: 'Unknown movement', sets: [] }] } }, exercises)).toThrow('Cannot match');
  });
});


describe('matching the last completed workout', () => {
  const routine = { id: 'routine-a', name: 'Upper A', exercises: [routineExercise(exercises[0])] };
  const current = { ...newWorkout(routine, exercises), startedAt: '2026-10-13T10:00:00.000Z' };
  const history = (date, changes = {}, state = 'synced') => ({ state, workout: { ...newWorkout(routine, exercises), status: 'completed', completedAt: date, ...changes } });
  it('uses the latest earlier workout for the same routine, excluding conflicts, drafts and future workouts', () => {
    const previous = history('2026-10-12T10:00:00.000Z');
    const rows = [history('2026-10-11T10:00:00.000Z'), previous,
      history('2026-10-12T11:00:00.000Z', { routineId: 'routine-b' }),
      history('2026-10-12T12:00:00.000Z', {}, 'conflict'),
      history('2026-10-12T13:00:00.000Z', {}, 'invalid'),
      history('2026-10-12T14:00:00.000Z', { status: 'in_progress' }),
      history('2026-10-14T10:00:00.000Z')];
    expect(previousWorkout(current, rows)).toBe(previous.workout);
  });
  it('matches the exercise sequence for workouts without a routine', () => {
    const scratch = { ...current, routineId: null };
    const previous = history('2026-10-12T10:00:00.000Z', { routineId: null, name: 'Renamed workout' });
    expect(previousWorkout(scratch, [previous, history('2026-10-12T11:00:00.000Z')])).toBe(previous.workout);
    expect(previousWorkout({ ...scratch, exercises: [] }, [previous])).toBeNull();
  });
  it('matches repeated exercises and separates warm-ups without shifting skipped set positions', () => {
    const set = { id: 'old', weight: 40, reps: 10, completed: true, warmup: false };
    const prior = { exercises: [
      { exerciseId: exercises[0].id, sets: [{ ...set, weight: 20, warmup: true }, set, { ...set, completed: false }, { ...set, weight: 45 }] },
      { exerciseId: exercises[0].id, sets: [{ ...set, weight: 60 }] },
    ] };
    const workout = { ...current, exercises: [sessionExercise(exercises[0]), sessionExercise(exercises[0])] };
    expect(previousSets(workout, 0, prior).map(s => s?.weight ?? null)).toEqual([40, null, 45]);
    expect(previousSets(workout, 1, prior).map(s => s?.weight ?? null)).toEqual([60, null, null]);
    workout.exercises[0].sets.unshift({ ...set, warmup: true });
    expect(previousSets(workout, 0, prior).map(s => s?.weight ?? null)).toEqual([20, 40, null, 45]);
  });
  it('counts valid, explicitly confirmed sets only', () => {
    expect(isSetComplete({ weight: 0, reps: 12, completed: true })).toBe(true);
    expect(isSetComplete({ weight: 40, reps: 10, completed: false })).toBe(false);
    expect(isSetComplete({ weight: null, reps: 10, completed: true })).toBe(false);
    expect(isSetComplete({ weight: 40, reps: 0, completed: true })).toBe(false);
  });
});

describe('one session in progress', () => {
  const now = Date.parse('2026-10-28T12:00:00.000Z');
  const session = (hoursAgo, { entered = false, state = 'synced', status = 'in_progress' } = {}) => {
    const workout = { ...newWorkout(null, exercises), status, startedAt: new Date(now - hoursAgo * 3600000).toISOString(), exercises: [sessionExercise(exercises[0])] };
    if (entered) workout.exercises[0].sets[1].rir = 0;
    return { id: workout.id, state, workout };
  };
  it('treats any typed value, including zero, as entered data', () => {
    const { workout } = session(0);
    expect(hasEnteredSets(workout)).toBe(false);
    workout.exercises[0].sets[2].weight = 0;
    expect(hasEnteredSets(workout)).toBe(true);
    expect(hasEnteredSets({ exercises: [] })).toBe(false);
  });
  it('resumes the newest session with entered sets and abandons only untouched extras', () => {
    const older = session(30, { entered: true }); const newer = session(2); const oldest = session(50, { state: 'pending' });
    const review = session(40, { state: 'conflict' }); const finished = session(1, { entered: true, status: 'completed' });
    const result = inProgress([oldest, newer, finished, review, older], now);
    expect(result.current).toBe(older);
    expect(result.abandoned).toEqual([newer, oldest]);
    expect(result.sessions).toEqual([older, review]);
  });
  it('resumes a newly started empty session but not one left for six hours', () => {
    const fresh = session(1); const stale = session(7);
    expect(inProgress([stale, fresh], now)).toEqual({ current: fresh, sessions: [fresh], abandoned: [stale] });
    expect(inProgress([stale], now)).toEqual({ current: null, sessions: [], abandoned: [stale] });
    expect(inProgress([], now).current).toBeNull();
  });
});
