import type { Workout, SessionExercise, Recommendation } from './contracts';

export function recommend(exercise: SessionExercise, history: Workout[]): Recommendation {
  const result: Recommendation = { action: 'baseline', proposedKg: null, previousKg: null, sourceSessionIds: [], evidence: [], reason: 'Log a complete baseline session for this exercise.' };
  if (exercise.snapshot.equipment === 'bodyweight') return { ...result, action: 'unsupported', reason: 'Bodyweight exercise: choose your load manually.' };
  const p = exercise.prescription;
  // Compare adjacent eligible sessions, never cherry-pick older successes around a mismatch.
  const candidates = history.filter(w => w.status === 'completed').sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? '')).flatMap(w => {
    const matches = w.exercises.filter(e => e.exerciseId === exercise.exerciseId);
    if (matches.length !== 1) return [];
    const e = matches[0];
    const working = e.sets.filter(s => !s.warmup);
    if (working.length !== e.prescription.workingSets || working.some(s => s.weight === null || s.reps === null)) return [];
    return [{ w, e, working }];
  }).slice(0, 2);
  if (!candidates.length) return result;
  result.sourceSessionIds = candidates.map(c => c.w.id);
  result.evidence = candidates.map(c => ({ sessionId: c.w.id, completedAt: c.w.completedAt!, sets: c.working.map(({ weight, reps, rir }) => ({ weight, reps, rir })) }));
  const latest = candidates[0];
  const weight = latest.working[0].weight!;
  if (latest.working.some(s => s.weight !== weight)) return { ...result, action: 'unsupported', reason: 'Mixed working weights: choose your next starting weight manually.' };
  result.previousKg = weight;
  result.proposedKg = weight;
  result.action = 'hold';
  result.reason = 'Repeat the previous working weight while building consistent reps.';
  if (candidates.length < 2) return { ...result, reason: 'Repeat this weight to establish a second comparable session.' };
  if (candidates.some(c => c.e.prescription.repMin !== p.repMin || c.e.prescription.repMax !== p.repMax || c.e.prescription.workingSets !== p.workingSets || c.working.some(s => s.weight !== weight))) {
    return { ...result, reason: 'Recent sessions use different targets or working weights. Establish two comparable sessions.' };
  }
  const increase = candidates.every(c => c.working.every(s => s.reps! >= p.repMax && (s.rir === null || s.rir >= 2)));
  const decrease = candidates.every(c => c.working.filter(s => s.reps! < p.repMin).length >= Math.ceil(p.workingSets / 2));
  if (!increase && !decrease) return result;
  if (p.incrementKg > weight * 0.1) return { ...result, reason: 'Your increment exceeds 10% of this weight. Use a smaller increment or choose a load manually.' };
  return { ...result, action: increase ? 'increase' : 'decrease', proposedKg: Math.round(Math.max(0, weight + (increase ? p.incrementKg : -p.incrementKg)) * 1000) / 1000,
    reason: increase ? 'Both recent sessions reached the top of your rep range on every working set, with sufficient reserve wherever recorded.' : 'At least half your working sets missed the minimum reps in both recent sessions.' };
}
