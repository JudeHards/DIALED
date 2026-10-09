import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import { exercises, defaultPrescription, recommend, weeklySummary, workoutSchema, type Workout, type SessionExercise } from '../src';
const bench = exercises.find(e => e.id === 'ex_bench_barbell')!;
function exercise(reps = 12, weight = 60, rir: number | null = 2): SessionExercise {
  return { id: randomUUID(), exerciseId: bench.id, snapshot: bench, prescription: defaultPrescription('barbell'),
    sets: Array.from({length:3}, () => ({ id: randomUUID(), weight, reps, rir, completed:true, warmup:false })) };
}
function session(e = exercise(), date = '2026-10-06T14:00:00.000Z'): Workout {
  return { id: randomUUID(), name:'Push', routineId:null, version:1, status:'completed', startedAt:'2026-10-01T10:00:00.000Z', completedAt:date, exercises:[e] };
}
describe('next-session progression', () => {
  it('increases one equipment increment after two comparable successful sessions', () => {
    const history=[session(),session(exercise(),'2026-10-04T14:00:00.000Z')]; const answer=recommend(exercise(),history);
    expect(answer.action).toBe('increase'); expect(answer.proposedKg).toBe(62.5); expect(answer.sourceSessionIds).toHaveLength(2);
  });
  it('does not mutate history order or logged sets', () => {
    const history=[session(exercise(),'2026-10-04T14:00:00.000Z'),session()]; const before=JSON.stringify(history);recommend(exercise(),history);expect(JSON.stringify(history)).toBe(before);
  });
  it('decreases after two sessions with at least half the work sets below target', () => {
    const e=exercise(6);expect(recommend(e,[session(e),session(exercise(7))]).proposedKg).toBe(57.5);
  });
  it('holds when reserve is insufficient despite hitting reps', () => expect(recommend(exercise(),[session(exercise(12,60,1)),session()]).action).toBe('hold'));
  it('allows missing optional reserve without inventing effort', () => expect(recommend(exercise(),[session(exercise(12,60,null)),session(exercise(12,60,null))]).action).toBe('increase'));
  it('holds when targets or working weights differ', () => {
    const e=exercise();e.prescription.repMax=15;expect(recommend(exercise(),[session(e),session()]).action).toBe('hold');
    expect(recommend(exercise(),[session(exercise(12,65)),session()]).action).toBe('hold');
  });
  it('requires a baseline and then a second complete session', () => {
    expect(recommend(exercise(),[]).proposedKg).toBeNull();expect(recommend(exercise(),[session()]).action).toBe('hold');
  });
  it('excludes incomplete workouts, partial exercises, and warm-ups', () => {
    const incomplete=session();incomplete.status='in_progress';incomplete.completedAt=null;
    const partial=session();partial.exercises[0].sets[0].reps=null;
    expect(recommend(exercise(),[incomplete,partial]).action).toBe('baseline');
    const withWarmup=session();withWarmup.exercises[0].sets.unshift({...withWarmup.exercises[0].sets[0],id:randomUUID(),weight:20,reps:5,warmup:true});
    expect(recommend(exercise(),[withWarmup,session()]).action).toBe('increase');
  });
  it('does not recommend mixed weights or bodyweight progression', () => {
    const mixed=session();mixed.exercises[0].sets[0].weight=40;expect(recommend(exercise(),[mixed]).action).toBe('unsupported');
    const e=exercise();e.snapshot={...bench,equipment:'bodyweight'};expect(recommend(e,[session()]).proposedKg).toBeNull();
  });
  it('holds when an equipment increment exceeds ten percent', () => expect(recommend(exercise(),[session(exercise(12,10)),session(exercise(12,10))]).action).toBe('hold'));
  it('ignores ambiguous duplicate exercise occurrences', () => {const s=session();s.exercises.push(exercise());expect(recommend(exercise(),[s]).action).toBe('baseline');});
});
describe('weekly muscle summary', () => {
  it('counts completed working sets with separate primary and secondary involvement', () => {
    const w=session();w.exercises[0].sets.push({...w.exercises[0].sets[0],id:randomUUID(),warmup:true});w.exercises[0].sets[0].reps=null;
    const summary=weeklySummary([w], 'Europe/Dublin',new Date('2026-10-07T12:00:00Z'));
    expect(summary.start).toBe('2026-10-05');expect(summary.counts.find(c=>c.muscle==='chest')).toMatchObject({primarySets:2,secondarySets:0});
    expect(summary.counts.find(c=>c.muscle==='triceps')).toMatchObject({primarySets:0,secondarySets:2});
  });
  it('uses local Monday boundaries and handles daylight saving weeks', () => {
    const onMonday=session(exercise(),'2026-10-04T23:30:00.000Z'); const before=session(exercise(),'2026-10-04T22:30:00.000Z');
    expect(weeklySummary([onMonday,before],'Europe/Dublin',new Date('2026-10-07T12:00:00Z')).counts[0].primarySets).toBe(3);
    expect(weeklySummary([],'America/New_York',new Date('2026-11-01T12:00:00Z')).start).toBe('2026-10-26');
  });
  it('excludes unfinished sessions',()=>{const w=session();w.status='in_progress';w.completedAt=null;expect(weeklySummary([w],'UTC',new Date('2026-10-07')).counts[0].primarySets).toBe(0);});
  it('accepts anterior delt sessions and counts their primary sets separately', () => {
    const raise = exercises.find(e => e.id === 'ex_anterior_delt_raise_cable')!;
    const w = session({ ...exercise(), exerciseId: raise.id, snapshot: raise });
    expect(workoutSchema.safeParse(w).success).toBe(true);
    const summary = weeklySummary([w], 'Europe/Dublin', new Date('2026-10-07T12:00:00Z'));
    expect(summary.counts.find(c => c.muscle === 'anterior delt')).toMatchObject({ primarySets: 3, secondarySets: 0 });
    expect(summary.counts.find(c => c.muscle === 'shoulders')).toMatchObject({ primarySets: 0, secondarySets: 0 });
  });
});
describe('shared validation', () => {
  it('preserves zero weight and rejects impossible set values', () => {
    expect(workoutSchema.parse(session(exercise(10,0))).exercises[0].sets[0].weight).toBe(0);
    expect(workoutSchema.safeParse(session(exercise(-1))).success).toBe(false);
    expect(workoutSchema.safeParse(session(exercise(10,-1))).success).toBe(false);
    expect(workoutSchema.safeParse(session(exercise(10,60,11))).success).toBe(false);
  });
  it('rejects inverted rep ranges and duplicate set IDs', () => {
    const w=session();w.exercises[0].prescription.repMin=20;expect(workoutSchema.safeParse(w).success).toBe(false);
    const duplicate=session();duplicate.exercises[0].sets[1].id=duplicate.exercises[0].sets[0].id;expect(workoutSchema.safeParse(duplicate).success).toBe(false);
  });
});
