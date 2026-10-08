import { useMemo, useState } from 'react';
import { prescriptionSchema, recommend } from '@dialed/shared';
import { useTraining } from '../lib/Training';

export default function Recommendation({ workout, exercise, onApply, synced = true }) {
  const { rows, api, online } = useTraining();
  const decision = useMemo(() => {
    if (!prescriptionSchema.safeParse(exercise.prescription).success) return null;
    return recommend(exercise, rows.filter(row => row.state !== 'conflict' && row.state !== 'invalid').map(row => row.workout).filter(value => value.id !== workout.id));
  }, [exercise, rows, workout.id]);
  const [result, setResult] = useState(null);
  const [pending, setPending] = useState(null);
  const signature = JSON.stringify(decision) + JSON.stringify(exercise.prescription) + exercise.id + workout.id;
  const explanation = result?.signature === signature ? result.value : null;
  const busy = pending === signature;
  const canApply = exercise.sets.some(set => !set.completed && !set.warmup && set.weight === null);

  async function explain() {
    setPending(signature);
    try {
      const value = await api.explain(workout.id, exercise.id);
      setResult({ signature, value });
    } catch {
      setResult({ signature, value: { explanation: decision.reason, source: 'rules' } });
    } finally { setPending(value => value === signature ? null : value); }
  }

  if (!decision) return <aside className="recommendation"><p>Enter valid targets above to see your next working weight.</p></aside>;
  return <aside className="recommendation" aria-label={`Load recommendation for ${exercise.snapshot.name}`}>
    <div className="row between"><span className="eyebrow">NEXT WORKING WEIGHT</span><span className="recommendation-action">{decision.action === 'unsupported' ? 'Manual' : decision.action}</span></div>
    <div className="row between wrap"><strong>{decision.proposedKg === null ? decision.action === 'unsupported' ? 'Choose your starting load' : 'Build your baseline' : `${decision.proposedKg} kg`}</strong>{decision.proposedKg !== null && <button className="button small" disabled={!canApply} onClick={() => onApply(decision.proposedKg)}>{canApply ? 'Apply to empty sets' : 'Working weights entered'}</button>}</div>
    <p>{explanation?.explanation ?? decision.reason}</p>
    {decision.evidence.length > 0 && <details><summary>Previous performance{decision.previousKg !== null ? ` · ${decision.previousKg} kg` : ''}</summary>{decision.evidence.map(evidence => <p key={evidence.sessionId}>{new Date(evidence.completedAt).toLocaleDateString()}: {evidence.sets.map(set => `${set.weight} kg × ${set.reps}${set.rir !== null ? ` (${set.rir} RIR)` : ''}`).join(' · ')}</p>)}</details>}
    {online && workout.version > 0 && synced && <button className="text-button" disabled={busy || explanation?.source === 'ai'} onClick={explain}>{busy ? 'Explaining…' : explanation?.source === 'ai' ? 'AI explanation shown' : 'Explain with AI'}</button>}
    <small className="muted">{explanation?.source === 'ai' ? 'AI explains the calculated decision.' : 'Calculated from your completed working sets.'}</small>
  </aside>;
}
