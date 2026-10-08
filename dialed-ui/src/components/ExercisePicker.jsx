import { useEffect, useRef, useState } from 'react';
import { muscles } from '@dialed/shared';

export function MuscleLabels({ exercise }) {
  return <div className="muscle-labels"><span aria-label={`Primary muscle: ${exercise.primaryMuscle}`}>{exercise.primaryMuscle}</span>{exercise.secondaryMuscles.map(muscle => <span className="secondary-muscle" key={muscle} aria-label={`Secondary muscle: ${muscle}`}>{muscle}</span>)}</div>;
}

export default function ExercisePicker({ catalog, onAdd, onClose, limit = 50 }) {
  const dialog = useRef(null);
  const [muscle, setMuscle] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    const element = dialog.current;
    element.showModal();
    return () => element.close();
  }, []);
  const filtered = catalog.filter(exercise => (muscle === 'all' || exercise.primaryMuscle === muscle || exercise.secondaryMuscles.includes(muscle)) && exercise.name.toLowerCase().includes(search.trim().toLowerCase()));
  return <dialog ref={dialog} onCancel={onClose} className="picker-dialog" aria-labelledby="picker-title">
    <div className="row between"><div><div className="eyebrow">BUILD YOUR SESSION</div><h2 id="picker-title">Add exercises</h2></div><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <input autoFocus aria-label="Search exercises" type="search" placeholder="Search exercises…" value={search} onChange={event => setSearch(event.target.value)}/>
    <label>Muscle group<select value={muscle} onChange={event => setMuscle(event.target.value)}><option value="all">All muscles</option>{muscles.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
    <div className="picker-count" role="status">{filtered.length} available · {selected.length} selected{selected.length >= limit ? ' · Session limit reached' : ''}</div>
    <div className="picker-list">{filtered.length ? filtered.map(exercise => <label key={exercise.id} className={`exercise-option ${selected.includes(exercise.id) ? 'selected' : ''}`}><input type="checkbox" disabled={selected.length >= limit && !selected.includes(exercise.id)} checked={selected.includes(exercise.id)} onChange={event => setSelected(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))}/><div><strong>{exercise.name}</strong><MuscleLabels exercise={exercise}/><small className="muted equipment-label">{exercise.equipment}</small></div></label>) : <div className="picker-empty"><p>No exercises match.</p><button type="button" className="text-button" onClick={() => { setSearch(''); setMuscle('all'); }}>Clear filters</button></div>}</div>
    <button type="button" className="button primary wide" disabled={!selected.length} onClick={() => { onAdd(selected.map(id => catalog.find(exercise => exercise.id === id)).filter(Boolean)); onClose(); }}>Add {selected.length || ''} exercise{selected.length === 1 ? '' : 's'}</button>
  </dialog>;
}
