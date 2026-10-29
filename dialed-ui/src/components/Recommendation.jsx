import { useMemo, useState } from 'react';
import { prescriptionSchema, recommend } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { isSetComplete } from '../lib/models';

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
  const canApply = exercise.sets.some(set => !isSetComplete(set) && !set.warmup && set.weight === null);

  async function explain() {
    setPending(signature);
    try {
      const value = await api.explain(workout.id, exercise.id);
      setResult({ signature, value });
    } catch {
      setResult({ signature, value: { explanation: decision.reason, source: 'rules' } });
    } finally { setPending(value => value === signature ? null : value); }
  }

  if (!decision) return <aside className="recommendation"><details className="recommendation-disclosure"><summary>Weight suggestion</summary><p>Check your targets above to see a suggested working weight.</p></details></aside>;
  const actionLabel = { baseline: 'Starting point', hold: 'Keep weight', increase: 'Increase', decrease: 'Reduce', unsupported: 'Choose weight' }[decision.action];
  return <aside className="recommendation" aria-label={`Weight suggestion for ${exercise.snapshot.name}`}>
    <details className="recommendation-disclosure"><summary>Weight suggestion{decision.proposedKg !== null && <strong> · {decision.proposedKg} kg</strong>}<span className="recommendation-action">{actionLabel}</span></summary>
    <div className="recommendation-content">
    <div className="row between wrap"><strong>{decision.proposedKg === null ? decision.action === 'unsupported' ? 'Choose your working weight' : 'Find your starting weight' : `${decision.proposedKg} kg`}</strong>{decision.proposedKg !== null && <button type="button" className="button small" disabled={!canApply} onClick={() => onApply(decision.proposedKg)}>{canApply ? 'Fill empty weights' : 'Weights already entered'}</button>}</div>
    <p aria-live="polite">{explanation?.explanation ?? decision.reason}</p>
    {decision.evidence.length > 0 && <details><summary>Previous performance{decision.previousKg !== null ? ` · ${decision.previousKg} kg` : ''}</summary>{decision.evidence.map(evidence => <p key={evidence.sessionId}>{new Date(evidence.completedAt).toLocaleDateString()}: {evidence.sets.map(set => `${set.weight} kg × ${set.reps}${set.rir !== null ? ` (${set.rir} RIR)` : ''}`).join(' · ')}</p>)}</details>}
    {online && workout.version > 0 && synced && <button type="button" className="text-button" disabled={busy || explanation?.source === 'ai'} onClick={explain}>{busy ? 'Explaining…' : explanation?.source === 'ai' ? 'AI explanation shown' : 'Explain with AI'}</button>}
    <small className="muted">{explanation?.source === 'ai' ? 'AI explains how this weight was calculated.' : 'Based on your logged working sets.'}</small>
    </div></details>
  </aside>;
}
