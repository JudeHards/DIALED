import { describe, expect, it } from 'vitest';
import { randomUUID } from 'node:crypto';
import {
  catalogSchema, exercises, muscleParts, weeklySummary, workoutSchema,
  defaultPrescription, muscles, type CatalogExercise, type Workout,
} from '../src';

function workout(snapshot: CatalogExercise, sets = 3): Workout {
  return {
    id: randomUUID(), name: 'Muscle tracking', routineId: null, version: 1,
    status: 'completed', startedAt: '2026-10-06T10:00:00.000Z', completedAt: '2026-10-06T11:00:00.000Z',
    exercises: [{ id: randomUUID(), exerciseId: snapshot.id, snapshot: structuredClone(snapshot), prescription: defaultPrescription(snapshot.equipment),
      sets: Array.from({ length: sets }, () => ({ id: randomUUID(), weight: 20, reps: 10, rir: null, completed: true, warmup: false })) }],
  };
}
const summaryFor = (...history: Workout[]) => weeklySummary(history, 'Europe/Dublin', new Date('2026-10-07T12:00:00Z'));
const find = (id: string) => exercises.find(exercise => exercise.id === id)!;

describe('detailed exercise catalogue', () => {
  it('provides validated, unique exercises with complete group/part mappings including Step Ups', () => {
    expect(exercises.length).toBeGreaterThanOrEqual(80);
    expect(new Set(exercises.map(exercise => exercise.id)).size).toBe(exercises.length);
    for (const exercise of exercises) {
      expect(catalogSchema.safeParse(exercise), exercise.id).toMatchObject({ success: true });
      expect(exercise.muscleTargets?.length, exercise.id).toBeGreaterThan(0);
      expect(exercise.primaryMuscle).not.toBe('shoulders');
      expect(exercise.secondaryMuscles).not.toContain('shoulders');
    }
    expect(find('ex_step_up')).toMatchObject({ laterality: 'unilateral', primaryMuscle: 'quads' });
    expect(find('ex_step_up').muscleTargets).toEqual(expect.arrayContaining([
      expect.objectContaining({ part: 'gluteus_maximus', role: 'secondary' }),
      expect.objectContaining({ part: 'vastus_lateralis', role: 'primary' }),
    ]));
    expect(new Set(muscleParts.map(part => part.id)).size).toBe(muscleParts.length);
  });

  it('rejects unknown parts, duplicate parts, inconsistent roles, and missing primary targets', () => {
    const exercise = structuredClone(find('ex_incline_db'));
    const target = exercise.muscleTargets![0];
    expect(catalogSchema.safeParse({ ...exercise, muscleTargets: [{ ...target, part: 'made_up_head' }] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...exercise, muscleTargets: [...exercise.muscleTargets!, target] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...exercise, muscleTargets: [{ ...target, role: 'secondary' }] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...exercise, muscleTargets: [] }).success).toBe(false);
    expect(catalogSchema.safeParse({ ...exercise, muscleTargets: exercise.muscleTargets!.map(part => ({ ...part, role: 'secondary' })) }).success).toBe(false);
  });

  it('records defensible head differences without pretending to isolate biceps or calf heads', () => {
    expect(find('ex_incline_db').muscleTargets).toContainEqual({ part: 'pectoralis_clavicular', role: 'primary', emphasis: 'biased' });
    expect(find('ex_oh_triceps_ext_cable').muscleTargets).toContainEqual({ part: 'triceps_long_head', role: 'primary', emphasis: 'biased' });
    for (const exercise of exercises) {
      for (const target of exercise.muscleTargets ?? []) {
        if (['biceps_long_head', 'biceps_short_head'].includes(target.part)) expect(target.emphasis).toBe('shared');
      }
    }
    // The short head does not cross the hip and should not receive RDL credit.
    expect(find('ex_rdl_barbell').muscleTargets?.some(target => target.part === 'biceps_femoris_short_head')).toBe(false);
    expect(find('ex_leg_curl').muscleTargets?.some(target => target.part === 'biceps_femoris_short_head')).toBe(true);
  });
});

describe('head and region set accounting', () => {
  it('tracks the three delt groups independently for presses and raises', () => {
    const summary = summaryFor(workout(find('ex_ohp')), workout(find('ex_lateral_raise_db'), 2), workout(find('ex_rear_delt_fly_db'), 4));
    expect(muscles).not.toContain('shoulders');
    expect(summary.counts.find(row => row.muscle === 'anterior delt')).toMatchObject({ primarySets: 3, secondarySets: 0 });
    expect(summary.counts.find(row => row.muscle === 'lateral delt')).toMatchObject({ primarySets: 2, secondarySets: 3 });
    expect(summary.counts.find(row => row.muscle === 'posterior delt')).toMatchObject({ primarySets: 4, secondarySets: 0 });
    expect(summary.totalWorkingSets).toBe(9);
    expect(summary.unassignedDeltSets).toEqual({ primarySets: 0, secondarySets: 0 });
  });

  it('resolves old combined groups using saved parts while counting each physical set only once', () => {
    const old = structuredClone(find('ex_ohp'));
    old.primaryMuscle = 'shoulders';
    old.secondaryMuscles = ['triceps'];
    old.muscleTargets = old.muscleTargets!.map(target => target.part === 'deltoid_lateral' ? { ...target, role: 'primary' } : target);
    const history = workoutSchema.parse(workout(old));
    const before = JSON.stringify(history);
    const summary = summaryFor(history);
    expect(summary.counts.find(row => row.muscle === 'anterior delt')?.primarySets).toBe(3);
    expect(summary.counts.find(row => row.muscle === 'lateral delt')?.primarySets).toBe(3);
    expect(summary.counts.find(row => row.muscle === 'posterior delt')?.primarySets).toBe(0);
    expect(summary.totalWorkingSets).toBe(3);
    expect(summary.unassignedDeltSets.primarySets).toBe(0);
    expect(JSON.stringify(history)).toBe(before);
  });

  it('keeps unspecified historical delt work in the session total without guessing its head', () => {
    const old = structuredClone(find('ex_lateral_raise_db'));
    old.primaryMuscle = 'shoulders'; delete old.muscleTargets; delete old.biasNotes;
    const oldBench = structuredClone(find('ex_bench_barbell'));
    oldBench.secondaryMuscles = ['triceps', 'shoulders']; delete oldBench.muscleTargets; delete oldBench.biasNotes;
    const summary = summaryFor(workoutSchema.parse(workout(old)), workoutSchema.parse(workout(oldBench, 2)));
    expect(summary.totalWorkingSets).toBe(5);
    expect(summary.unassignedDeltSets).toEqual({ primarySets: 3, secondarySets: 2 });
    expect(summary.counts.filter(row => row.muscle.endsWith('delt')).every(row => row.primarySets === 0 && row.secondarySets === 0)).toBe(true);
    expect(summary.unmappedSets).toBe(5);
  });

  it('counts heads separately while counting each set once for the broad group', () => {
    const summary = summaryFor(workout(find('ex_incline_db')), workout(find('ex_bench_barbell'), 2));
    expect(summary.counts.find(row => row.muscle === 'chest')).toMatchObject({ primarySets: 5, secondarySets: 0 });
    expect(summary.partCounts.find(row => row.part === 'pectoralis_clavicular')).toMatchObject({ primarySets: 5, secondarySets: 0, biasedSets: 3 });
    expect(summary.partCounts.find(row => row.part === 'triceps_lateral_head')).toMatchObject({ primarySets: 0, secondarySets: 5, biasedSets: 0 });
    expect(summary.unmappedSets).toBe(0);
  });

  it('excludes unchecked, warm-up, blank, unfinished, and outside-week sets from every total', () => {
    const logged = workout(find('ex_incline_db'), 5);
    const sets = logged.exercises[0].sets;
    sets[1].completed = false;
    sets[2].warmup = true;
    sets[3].weight = null;
    sets[4].reps = null;
    const unfinished = workout(find('ex_incline_db')); unfinished.status = 'in_progress'; unfinished.completedAt = null;
    const lastWeek = workout(find('ex_incline_db')); lastWeek.completedAt = '2026-10-04T12:00:00.000Z';
    const summary = summaryFor(logged, unfinished, lastWeek);
    expect(summary.counts.find(row => row.muscle === 'chest')?.primarySets).toBe(1);
    expect(summary.partCounts.find(row => row.part === 'pectoralis_clavicular')?.biasedSets).toBe(1);
  });

  it('preserves saved emphasis rather than replacing it with current catalogue metadata', () => {
    const logged = workout(find('ex_incline_db'));
    logged.exercises[0].snapshot.muscleTargets = logged.exercises[0].snapshot.muscleTargets!.map(target => ({ ...target, emphasis: 'shared' }));
    const before = JSON.stringify(logged);
    expect(summaryFor(logged).partCounts.find(row => row.part === 'pectoralis_clavicular')).toMatchObject({ primarySets: 3, biasedSets: 0 });
    expect(JSON.stringify(logged)).toBe(before);
  });

  it('preserves legacy snapshots and reports missing part coverage beside mixed new data', () => {
    const oldExercise = structuredClone(find('ex_incline_db'));
    delete oldExercise.muscleTargets; delete oldExercise.biasNotes;
    const old = workoutSchema.parse(workout(oldExercise));
    expect(old.exercises[0].snapshot.muscleTargets).toBeUndefined();
    const summary = summaryFor(old, workout(find('ex_incline_db'), 2));
    expect(summary.counts.find(row => row.muscle === 'chest')?.primarySets).toBe(5);
    expect(summary.partCounts.find(row => row.part === 'pectoralis_clavicular')).toMatchObject({ primarySets: 2, biasedSets: 2 });
    expect(summary.unmappedSets).toBe(3);
  });
});
