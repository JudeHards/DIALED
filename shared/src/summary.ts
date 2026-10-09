import type { Workout } from './contracts';
import { muscles, muscleParts, normalizeMuscleGroup } from './muscles';
function localDate(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  return ['year', 'month', 'day'].map(type => parts.find(p => p.type === type)!.value).join('-');
}
export function weeklySummary(history: Workout[], timezone: string, now = new Date()) {
  const today = new Date(localDate(now, timezone) + 'T12:00:00Z');
  today.setUTCDate(today.getUTCDate() - ((today.getUTCDay() + 6) % 7));
  const start = today.toISOString().slice(0, 10);
  today.setUTCDate(today.getUTCDate() + 7);
  const endExclusive = today.toISOString().slice(0, 10);
  const counts = muscles.map(muscle => ({ muscle, primarySets: 0, secondarySets: 0 }));
  const partCounts = muscleParts.map(({ id: part, label, group }) => ({ part, label, group, primarySets: 0, secondarySets: 0, biasedSets: 0 }));
  const partIndex = new Map(partCounts.map(item => [item.part, item]));
  let unmappedSets = 0;
  for (const w of history) {
    if (w.status !== 'completed' || !w.completedAt) continue;
    const day = localDate(new Date(w.completedAt), timezone);
    if (day < start || day >= endExclusive) continue;
    for (const e of w.exercises) {
      const count = e.sets.filter(s => s.completed && s.weight !== null && s.reps !== null && !s.warmup).length;
      const primary = normalizeMuscleGroup(e.snapshot.primaryMuscle);
      const secondary = e.snapshot.secondaryMuscles.map(normalizeMuscleGroup);
      for (const item of counts) {
        if (primary === item.muscle) item.primarySets += count;
        else if (secondary.includes(item.muscle)) item.secondarySets += count;
      }
      if (!e.snapshot.muscleTargets?.length) unmappedSets += count;
      // Count each logged set once per part, never multiply broad-group totals
      // by the number of heads in that group. Summaries use saved snapshots.
      const seen = new Set<string>();
      for (const target of e.snapshot.muscleTargets ?? []) {
        if (seen.has(target.part)) continue;
        seen.add(target.part);
        const item = partIndex.get(target.part);
        if (!item) continue;
        if (target.role === 'primary') item.primarySets += count;
        else item.secondarySets += count;
        if (target.emphasis === 'biased' && target.role === 'primary') item.biasedSets += count;
      }
    }
  }
  return { start, endExclusive, timezone, counts, partCounts, unmappedSets };
}
