import { useEffect, useRef, useState } from 'react';
import { muscles, muscleParts, musclePartDetails, normalizeMuscleGroup } from '@dialed/shared';

export function MuscleLabels({ exercise }) {
  const targets = (exercise.muscleTargets ?? []).filter(target => musclePartDetails[target.part]);
  const biased = targets.filter(target => target.emphasis === 'biased');
  const primaryGroup = normalizeMuscleGroup(exercise.primaryMuscle);
  const secondaryGroups = [...new Set((exercise.secondaryMuscles ?? []).map(normalizeMuscleGroup))].filter(group => group !== primaryGroup);
  return <div className="exercise-muscles">
    <div className="muscle-labels"><span aria-label={`Primary muscle: ${primaryGroup}`}>{primaryGroup}</span>{secondaryGroups.map(group => <span className="secondary-muscle" key={group} aria-label={`Secondary muscle: ${group}`}>{group}</span>)}</div>
    {targets.length ? <>
      {biased.length > 0 && <p className="muscle-emphasis"><span>Expected bias:</span> {biased.map(target => musclePartDetails[target.part].label).join(' · ')}</p>}
      <details className="muscle-part-details">
        <summary>Muscle parts &amp; emphasis</summary>
        {['primary', 'secondary'].map(role => {
          const parts = targets.filter(target => target.role === role);
          return parts.length > 0 && <div className="muscle-part-group" key={role}>
            <span className="muscle-role">{role === 'primary' ? 'Primary parts' : 'Secondary parts'}</span>
            <ul>{parts.map(target => <li key={target.part}><span>{musclePartDetails[target.part].label}</span>{target.emphasis === 'biased' && <span className="bias-badge">Biased</span>}</li>)}</ul>
          </div>;
        })}
        {exercise.biasNotes && <p>{exercise.biasNotes}</p>}
        <p>Bias describes expected emphasis, not isolation or measured activation. Unmarked parts share the exercise’s work.</p>
      </details>
    </> : <p className="muted muscle-detail-unavailable">Part detail unavailable for this saved exercise.</p>}
  </div>;
}

export default function ExercisePicker({ catalog, onAdd, onClose, limit = 50 }) {
  const dialog = useRef(null);
  const [muscle, setMuscle] = useState('all');
  const [part, setPart] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const availableParts = muscleParts.filter(value => muscle === 'all' || value.group === muscle);
  const query = search.trim().toLowerCase();
  const filtered = catalog.filter(exercise => {
    const targets = exercise.muscleTargets ?? [];
    const groups = [exercise.primaryMuscle, ...(exercise.secondaryMuscles ?? []), ...targets.map(target => musclePartDetails[target.part]?.group)].filter(Boolean).map(normalizeMuscleGroup);
    const matchesGroup = muscle === 'all' || groups.includes(muscle);
    const matchesPart = part === 'all' || targets.some(target => target.part === part);
    const searchText = [exercise.name, ...groups, ...targets.map(target => musclePartDetails[target.part]?.label)].join(' ').toLowerCase();
    return matchesGroup && matchesPart && query.split(/\s+/).every(term => searchText.includes(term));
  });
  function clearFilters() { setSearch(''); setMuscle('all'); setPart('all'); }
  return <dialog ref={dialog} onCancel={onClose} className="picker-dialog" aria-labelledby="picker-title">
    <div className="row between"><div><div className="eyebrow">BUILD YOUR SESSION</div><h2 id="picker-title">Add exercises</h2></div><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <input autoFocus aria-label="Search exercises" type="search" placeholder="Search exercises or muscle parts…" value={search} onChange={event => setSearch(event.target.value)}/>
    <div className="picker-filters">
      <label>Muscle group<select value={muscle} onChange={event => { setMuscle(event.target.value); setPart('all'); }}><option value="all">All muscles</option>{muscles.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
      <label>Muscle part<select value={part} onChange={event => setPart(event.target.value)}><option value="all">All parts</option>{availableParts.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
    </div>
    <p className="muted small-text picker-help">Includes primary and secondary targets. Bias describes expected emphasis.</p>
    <div className="picker-count" role="status">{filtered.length} available · {selected.length} selected{selected.length >= limit ? ' · Session limit reached' : ''}</div>
    <div className="picker-list">{filtered.length ? filtered.map(exercise => <div key={exercise.id} className={`exercise-option ${selected.includes(exercise.id) ? 'selected' : ''}`}>
      <input id={`pick-${exercise.id}`} type="checkbox" disabled={selected.length >= limit && !selected.includes(exercise.id)} checked={selected.includes(exercise.id)} onChange={event => setSelected(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))}/>
      <div className="exercise-option-content"><label htmlFor={`pick-${exercise.id}`}><strong>{exercise.name}</strong></label><MuscleLabels exercise={exercise}/><small className="muted equipment-label">{exercise.equipment}</small></div>
    </div>) : <div className="picker-empty"><p>No exercises match.</p><button type="button" className="text-button" onClick={clearFilters}>Clear filters</button></div>}</div>
    <button type="button" className="button primary wide" disabled={!selected.length} onClick={() => { onAdd(selected.map(id => catalog.find(exercise => exercise.id === id)).filter(Boolean)); onClose(); }}>Add {selected.length || ''} exercise{selected.length === 1 ? '' : 's'}</button>
  </dialog>;
}
