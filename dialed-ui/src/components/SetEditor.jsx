import { useId, useRef } from 'react';
import { prescriptionSchema } from '@dialed/shared';
import { hasSetValues, isSetComplete } from '../lib/models';

export function PrescriptionEditor({ value, onChange, disabled = false }) {
  const errorId = useId();
  const validation = prescriptionSchema.safeParse(value);
  return <>
    <div className="prescription-grid">{[['workingSets', 'Working sets', 1, 20, 1], ['repMin', 'Min reps', 1, 100, 1], ['repMax', 'Max reps', 1, 100, 1], ['incrementKg', 'Increase (kg)', 0.01, 100, 0.01]].map(([key, label, min, max, step]) => <label key={key}>{label}<input type="number" required min={min} max={max} step={step} inputMode={key === 'incrementKg' ? 'decimal' : 'numeric'} enterKeyHint="next" disabled={disabled} aria-invalid={!validation.success && validation.error.issues.some(issue => issue.path.includes(key))} aria-describedby={!validation.success ? errorId : undefined} value={value[key] ?? ''} onChange={event => onChange({ ...value, [key]: event.target.value === '' ? null : Number(event.target.value) })}/></label>)}</div>
    {!validation.success && <p className="field-error" id={errorId} role="status">Use 1–20 working sets, 1–100 reps, and a weight increase from 0.01–100 kg. Minimum reps must not exceed maximum reps.</p>}
  </>;
}

export default function SetEditor({ set, index, onChange, onRemove, rirHelpId, previous = null }) {
  const errorId = useId();
  const previousId = useId();
  const repsFocused = useRef(false);
  const suggested = key => set[key] === null && previous?.[key] != null;
  const resolved = key => set[key] ?? previous?.[key] ?? null;
  const validWeight = set.weight === null || (Number.isFinite(set.weight) && set.weight >= 0 && set.weight <= 2000);
  const validReps = set.reps === null || (Number.isInteger(set.reps) && set.reps >= 1 && set.reps <= 1000);
  const validRir = set.rir === null || (Number.isInteger(set.rir) && set.rir >= 0 && set.rir <= 10);
  function field(key, value) {
    const next = { ...set, [key]: value };
    onChange({ ...next, completed: key !== 'reps' && isSetComplete(next) });
  }
  function confirmReps() {
    if (!repsFocused.current) return;
    repsFocused.current = false;
    const next = { ...set, weight: resolved('weight'), reps: resolved('reps') };
    onChange({ ...next, completed: hasSetValues(next) });
  }
  return <div className={`set-row ${isSetComplete(set) ? 'set-complete' : ''}`}>
    <span className="set-number">{index + 1}</span>
    <label><span className="sr-only">Set {index + 1} weight in kg</span><input type="number" min="0" max="2000" step="0.01" inputMode="decimal" enterKeyHint="next" className={suggested('weight') ? 'previous-value' : undefined} aria-invalid={!validWeight} aria-describedby={[!validWeight && errorId, suggested('weight') && previousId].filter(Boolean).join(' ') || undefined} placeholder={previous?.weight != null ? String(previous.weight) : 'kg'} value={set.weight ?? ''} onChange={event => field('weight', event.target.value === '' ? null : Number(event.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps</span><input type="number" min="1" max="1000" step="1" inputMode="numeric" enterKeyHint="done" className={suggested('reps') ? 'previous-value' : undefined} aria-invalid={!validReps} aria-describedby={[!validReps && errorId, previous && previousId].filter(Boolean).join(' ') || undefined} placeholder={previous?.reps != null ? String(previous.reps) : 'Reps'} value={set.reps ?? ''} onFocus={() => { repsFocused.current = true; }} onBlur={confirmReps} onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur(); } }} onChange={event => field('reps', event.target.value === '' ? null : Number(event.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps in reserve (optional)</span><input type="number" min="0" max="10" step="1" inputMode="numeric" enterKeyHint="done" aria-invalid={!validRir} aria-describedby={[rirHelpId, !validRir && errorId].filter(Boolean).join(' ') || undefined} placeholder="RIR" value={set.rir ?? ''} onChange={event => field('rir', event.target.value === '' ? null : Number(event.target.value))}/></label>
    {(!validWeight || !validReps || !validRir) && <p className="field-error set-validation" id={errorId} role="status">Use 0–2,000 kg, 1–1,000 whole reps, and optional RIR from 0–10.</p>}
    {previous && <span className="sr-only" id={previousId}>Previous set: {previous.weight} kg × {previous.reps} reps. Faint values are hints; typing replaces just that field. Enter and leave the reps field to log this set.</span>}
    <div className="set-options"><label><input type="checkbox" aria-label={`Set ${index + 1} is a warm-up`} checked={set.warmup} onChange={event => onChange({ ...set, warmup: event.target.checked })}/> Warm-up</label>{isSetComplete(set) && <span className="set-logged">Logged ✓</span>}<button type="button" className="text-button" aria-label={`Remove set ${index + 1}`} onClick={onRemove}>Remove</button></div>
  </div>;
}
