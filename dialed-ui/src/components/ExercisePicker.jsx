import { useEffect, useRef, useState } from 'react';
import { muscles } from '@dialed/shared';
export function MuscleLabels({ exercise }) {
  return <div className="muscle-labels"><span>{exercise.primaryMuscle}</span>{exercise.secondaryMuscles.length > 0 && <small>Also {exercise.secondaryMuscles.join(', ')}</small>}</div>;
}
export default function ExercisePicker({ catalog, onAdd, onClose }) {
  const dialog = useRef(null); const [muscle, setMuscle] = useState('all'); const [search, setSearch] = useState(''); const [selected, setSelected] = useState([]);
  useEffect(() => { dialog.current.showModal(); }, []);
  const filtered = catalog.filter(e => (muscle === 'all' || e.primaryMuscle === muscle || e.secondaryMuscles.includes(muscle)) && e.name.toLowerCase().includes(search.toLowerCase()));
  return <dialog ref={dialog} onCancel={onClose} className="picker-dialog" aria-labelledby="picker-title"><div className="row between"><h2 id="picker-title">Add exercises</h2><button className="text-button" onClick={onClose}>Close</button></div>
    <input autoFocus aria-label="Search exercises" placeholder="Search exercises…" value={search} onChange={e => setSearch(e.target.value)}/>
    <label>Muscle group<select value={muscle} onChange={e => setMuscle(e.target.value)}><option value="all">All muscles</option>{muscles.map(m => <option key={m} value={m}>{m}</option>)}</select></label>
    <div className="picker-list">{filtered.length ? filtered.map(e => <label key={e.id} className="exercise-option"><input type="checkbox" checked={selected.includes(e.id)} onChange={event => setSelected(current => event.target.checked ? [...current, e.id] : current.filter(id => id !== e.id))}/><div><strong>{e.name}</strong><MuscleLabels exercise={e}/><small className="muted">{e.equipment}</small></div></label>) : <p className="muted">No exercises match. Try another search or muscle.</p>}</div>
    <button className="button primary wide" disabled={!selected.length} onClick={() => { onAdd(selected.map(id => catalog.find(e => e.id === id))); onClose(); }}>Add {selected.length || ''} exercise{selected.length === 1 ? '' : 's'}</button>
  </dialog>;
}
