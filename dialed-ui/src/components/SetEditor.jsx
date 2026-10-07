export function PrescriptionEditor({ value, onChange, disabled = false }) {
  return <div className="prescription-grid">{[['workingSets','Work sets',1,20,1],['repMin','Min reps',1,100,1],['repMax','Max reps',1,100,1],['incrementKg','Step (kg)',0.01,100,0.01]].map(([key,label,min,max,step]) => <label key={key}>{label}<input type="number" min={min} max={max} step={step} disabled={disabled} value={value[key] ?? ''} onChange={e => onChange({ ...value, [key]: e.target.value === '' ? null : Number(e.target.value) })}/></label>)}</div>;
}
export default function SetEditor({ set, index, onChange, onRemove }) {
  const valid = set.weight !== null && set.weight >= 0 && Number.isFinite(set.weight) && Number.isInteger(set.reps) && set.reps > 0;
  function field(key, value) { onChange({ ...set, [key]: value, completed: false }); }
  return <div className={`set-row ${set.completed ? 'set-complete' : ''}`}><span className="set-number">{index + 1}</span>
    <label><span className="sr-only">Set {index + 1} weight in kg</span><input type="number" min="0" max="2000" step="0.01" inputMode="decimal" placeholder="kg" value={set.weight ?? ''} onChange={e => field('weight', e.target.value === '' ? null : Number(e.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps</span><input type="number" min="1" max="1000" step="1" inputMode="numeric" placeholder="Reps" value={set.reps ?? ''} onChange={e => field('reps', e.target.value === '' ? null : Number(e.target.value))}/></label>
    <label><span className="sr-only">Set {index + 1} reps in reserve</span><input type="number" min="0" max="10" step="1" inputMode="numeric" placeholder="RIR" value={set.rir ?? ''} onChange={e => field('rir', e.target.value === '' ? null : Number(e.target.value))}/></label>
    <button className="done-button" aria-label={`Mark set ${index + 1} ${set.completed ? 'incomplete' : 'complete'}`} aria-pressed={set.completed} disabled={!valid} onClick={() => onChange({ ...set, completed: !set.completed })}>✓</button>
    <div className="set-options"><label><input type="checkbox" checked={set.warmup} onChange={e => onChange({ ...set, warmup: e.target.checked })}/> Warm-up</label><button className="text-button" onClick={onRemove}>Remove</button></div>
  </div>;
}
