import { prescriptionSchema } from '@dialed/shared';
import { isSetComplete } from '../lib/models';

export function PrescriptionEditor({ value, onChange, disabled = false }) {
  const validation = prescriptionSchema.safeParse(value);
  return <>
    <div className="prescription-grid">{[['workingSets', 'Work sets', 1, 20, 1], ['repMin', 'Min reps', 1, 100, 1], ['repMax', 'Max reps', 1, 100, 1], ['incrementKg', 'Step (kg)', 0.01, 100, 0.01]].map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" required min={min} max={max} step={step} inputMode={key === 'incrementKg' ? 'decimal' : 'numeric'} disabled={disabled} aria-invalid={!validation.success && validation.error.issues.some(issue => issue.path.includes(key))} value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value === '' ? null : Number(event.target.value) })}/></label>)}</div>
    {!validation.success && <p className="field-error" role="status">Use 1–20 sets, 1–100 reps, and a positive weight step. Minimum reps must not exceed maximum reps.</p>}
  </>;
}

export default function SetEditor({ set, index, onChange, onRemove }) {
  const validWeight = set.weight === null || (Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 2000);
  const validReps = set.reps === null || (Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000);
  const validRir = set.rir === null || (Number.isInteger(set.rir) && set.rir >= 0 && set.rir <= 10);
  function field(key, value) {
    const next = { ...set, [key]: value };
    onChange({ ...next, completed: isSetComplete(next) });
  }
  return <div className={`set-row ${isSetComplete(set) ? 'set-complete' : ''}`}>
    <span className="set-number">{index + 1}</span>
    <label><span className="sr-only">Set {index + 1} weight in kg</span><input type="number" min="0" max="2000" step="0.01" inputMode="decimal" aria-invalid={!validWeight} placeholder="kg" value={set.weight ?? ''} onChange={event => field('weight', event.target.value === '' ? null : Number(event.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps</span><input type="number" min="1" max="1000" step="1" inputMode="numeric" aria-invalid={!validReps} placeholder="Reps" value={set.reps ?? ''} onChange={event => field('reps', event.target.value === '' ? null : Number(event.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps in reserve</span><input type="number" min="0" max="10" step="1" inputMode="numeric" aria-invalid={!validRir} placeholder="RIR" value={set.rir ?? ''} onChange={event => field('rir', event.target.value === '' ? null : Number(event.target.value))}/></label>
    {(!validWeight || !validReps || !validRir) && <p className="field-error set-validation" role="status">Use 0–2,000 kg, 1–1,000 whole reps, and optional RIR from 0–10.</p>}
    <div className="set-options"><label><input type="checkbox" checked={set.warmup} onChange={event => onChange({ ...set, warmup: event.target.checked })}/> Warm-up</label><button className="text-button" aria-label={`Remove set ${index + 1}`} onClick={onRemove}>Remove</button></div>
  </div>;
}
