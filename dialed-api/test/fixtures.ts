import { randomUUID } from 'node:crypto';
import type { CatalogExercise, Routine, Workout } from '@dialed/shared';

export const userA = '11111111-1111-4111-8111-111111111111';
export const userB = '22222222-2222-4222-8222-222222222222';
export const bench: CatalogExercise = { id: 'ex_bench_barbell', name: 'Barbell Bench Press', primaryMuscle: 'chest', secondaryMuscles: ['triceps', 'shoulders'], equipment: 'barbell', movement: 'compound', laterality: 'bilateral' };
export const prescription = { workingSets: 3, repMin: 8, repMax: 12, incrementKg: 2.5 };
export function workout(overrides: Partial<Workout> = {}): Workout {
  return { id: randomUUID(), name: 'Push day', version: 0, routineId: null, status: 'in_progress', startedAt: '2026-10-07T10:00:00.000Z', completedAt: null,
    exercises: [{ id: randomUUID(), exerciseId: bench.id, snapshot: structuredClone(bench), prescription: { ...prescription }, sets: Array.from({ length: 3 }, () => ({ id: randomUUID(), weight: 50, reps: 12, rir: 2, completed: true, warmup: false })) }], ...overrides };
}
export function routine(overrides: Partial<Routine> = {}): Routine {
  return { id: randomUUID(), name: 'Push day', version: 0, exercises: [{ id: randomUUID(), exerciseId: bench.id, prescription: { ...prescription } }], ...overrides };
}
