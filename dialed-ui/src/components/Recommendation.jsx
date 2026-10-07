import { useEffect, useMemo, useState } from 'react';
import { recommend } from '@dialed/shared';
import { useTraining } from '../lib/Training';
export default function Recommendation({ workout, exercise, onApply }) {
  const { rows, api, online } = useTraining();
  const decision = useMemo(() => recommend(exercise, rows.map(r => r.workout).filter(w => w.id !== workout.id)), [exercise, rows, workout.id]);
  const [explanation, setExplanation] = useState(null); const [busy, setBusy] = useState(false);
  const signature = JSON.stringify(decision) + JSON.stringify(exercise.prescription);
  useEffect(() => { setExplanation(null); }, [signature]);
  async function explain() {
    setBusy(true);
    try { setExplanation(await api.explain(workout.id, exercise.id)); } catch { setExplanation({ explanation: decision.reason, source: 'rules' }); } finally { setBusy(false); }
  }
  return <aside className="recommendation"><div className="row between"><span className="eyebrow">NEXT WORKING WEIGHT</span><span className="recommendation-action">{decision.action}</span></div>
    <div className="row between"><strong>{decision.proposedKg === null ? 'Build your baseline' : `${decision.proposedKg} kg`}</strong>{decision.proposedKg !== null && <button className="button small" onClick={() => onApply(decision.proposedKg)}>Apply to empty sets</button>}</div>
    <p>{explanation?.explanation ?? decision.reason}</p>
    {decision.evidence.length > 0 && <details><summary>Previous performance</summary>{decision.evidence.map(e => <p key={e.sessionId}>{new Date(e.completedAt).toLocaleDateString()}: {e.sets.map(s => `${s.weight} kg × ${s.reps}${s.rir !== null ? ` (${s.rir} RIR)` : ''}`).join(' · ')}</p>)}</details>}
    {online && workout.version > 0 && <button className="text-button" disabled={busy} onClick={explain}>{busy ? 'Explaining…' : explanation?.source === 'ai' ? 'AI explanation' : 'Explain with AI'}</button>}
    <small className="muted">{explanation?.source === 'ai' ? 'AI explains the calculated decision.' : 'Calculated from your completed working sets.'}</small>
  </aside>;
}
