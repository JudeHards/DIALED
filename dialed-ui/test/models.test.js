import { describe, expect, it } from 'vitest';
import { exercises } from '@dialed/shared';
import { legacyRecords, newWorkout, recoverLegacy, routineExercise, sessionExercise } from '../src/lib/models';

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
