import { muscles, type Workout } from './contracts';
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
  for (const w of history) {
    if (w.status !== 'completed' || !w.completedAt) continue;
    const day = localDate(new Date(w.completedAt), timezone);
    if (day < start || day >= endExclusive) continue;
    for (const e of w.exercises) {
      const count = e.sets.filter(s => s.weight !== null && s.reps !== null && !s.warmup).length;
      for (const item of counts) {
        if (e.snapshot.primaryMuscle === item.muscle) item.primarySets += count;
        else if (e.snapshot.secondaryMuscles.includes(item.muscle)) item.secondarySets += count;
      }
    }
  }
  return { start, endExclusive, timezone, counts };
}
