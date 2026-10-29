import { useEffect, useRef, useState } from 'react';
import { muscles, muscleParts, musclePartDetails, exerciseMuscleGroups } from '@dialed/shared';

export function MuscleLabels({ exercise }) {
  const targets = (exercise.muscleTargets ?? []).filter(target => musclePartDetails[target.part]);
  const biased = targets.filter(target => target.emphasis === 'biased');
  const groups = exerciseMuscleGroups(exercise);
  return <div className="exercise-muscles">
    <div className="muscle-labels">
      {groups.primary.map(group => <span key={group} aria-label={`Primary muscle: ${group}`}>{group}</span>)}
      {groups.unassignedDelts.primary && <span aria-label="Primary muscle: Delt head unspecified">Delt head unspecified</span>}
      {groups.secondary.map(group => <span className="secondary-muscle" key={group} aria-label={`Secondary muscle: ${group}`}>{group}</span>)}
      {groups.unassignedDelts.secondary && <span className="secondary-muscle" aria-label="Secondary muscle: Delt head unspecified">Delt head unspecified</span>}
    </div>
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
        <p>Bias describes expected emphasis, not isolation or measured activation. Parts without a bias label share the work.</p>
      </details>
    </> : <p className="muted muscle-detail-unavailable">Part detail unavailable for this saved exercise.</p>}
  </div>;
}

export default function ExercisePicker({ catalog, onAdd, onClose, limit = 50 }) {
  const dialog = useRef(null);
  const heading = useRef(null);
  const searchInput = useRef(null);
  const [muscle, setMuscle] = useState('all');
  const [part, setPart] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState([]);
  useEffect(() => {
    const element = dialog.current;
    const viewport = window.visualViewport;
    let fullHeight = window.innerHeight;
    let fullWidth = window.innerWidth;
    function updateViewport() {
      if (!viewport) return;
      // Reset the reference on rotation, and preserve it while a keyboard resizes the view.
      if (window.innerWidth !== fullWidth) {
        fullWidth = window.innerWidth;
        fullHeight = window.innerHeight;
      }
      fullHeight = Math.max(fullHeight, window.innerHeight);
      element.style.setProperty('--picker-viewport-height', `${viewport.height}px`);
      element.style.setProperty('--picker-viewport-top', `${viewport.offsetTop}px`);
      const keyboardOpen = (viewport.scale ?? 1) === 1 && fullHeight - viewport.height > 150;
      element.classList.toggle('picker-keyboard-open', keyboardOpen);
    }
    updateViewport();
    viewport?.addEventListener('resize', updateViewport);
    viewport?.addEventListener('scroll', updateViewport);
    element.showModal();
    // Keep the keyboard closed until someone chooses to search.
    heading.current.focus({ preventScroll: true });
    return () => {
      viewport?.removeEventListener('resize', updateViewport);
      viewport?.removeEventListener('scroll', updateViewport);
      element.close();
    };
  }, []);
  const availableParts = muscleParts.filter(value => muscle === 'all' || value.group === muscle);
  const query = search.trim().toLowerCase();
  const filtered = catalog.filter(exercise => {
    const targets = exercise.muscleTargets ?? [];
    const mapped = exerciseMuscleGroups(exercise);
    const groups = [...mapped.primary, ...mapped.secondary];
    const matchesGroup = muscle === 'all' || groups.includes(muscle);
    const matchesPart = part === 'all' || targets.some(target => target.part === part);
    const searchText = [exercise.name, ...groups, ...targets.map(target => musclePartDetails[target.part]?.label), mapped.unassignedDelts.primary || mapped.unassignedDelts.secondary ? 'delt head unspecified' : ''].join(' ').toLowerCase();
    return matchesGroup && matchesPart && query.split(/\s+/).every(term => searchText.includes(term));
  });
  const hasFilters = search.trim() !== '' || muscle !== 'all' || part !== 'all';
  function clearFilters() { setSearch(''); setMuscle('all'); setPart('all'); }
  return <dialog ref={dialog} onCancel={onClose} className="picker-dialog" aria-labelledby="picker-title">
    <div className="row between picker-header"><div><div className="eyebrow">EXERCISE LIBRARY</div><h2 ref={heading} tabIndex={-1} id="picker-title">Add exercises</h2></div><button type="button" className="text-button" onClick={onClose}>Close</button></div>
    <div className="picker-body">
    <div className="picker-controls">
      <div className="picker-search">
        <input ref={searchInput} aria-label="Search exercises" type="search" placeholder="Search exercises or muscles" autoComplete="off" autoCapitalize="none" spellCheck={false} enterKeyHint="search" value={search} onChange={event => setSearch(event.target.value)} onKeyDown={event => { if (event.key === 'Enter') event.currentTarget.blur(); }}/>
        {search && <button type="button" className="text-button picker-clear-search" aria-label="Clear search" onClick={() => { setSearch(''); searchInput.current.focus(); }}>Clear</button>}
      </div>
      <div className="picker-filters">
        <label>Muscle group<select value={muscle} onChange={event => { setMuscle(event.target.value); setPart('all'); }}><option value="all">All muscles</option>{muscles.map(value => <option key={value} value={value}>{value}</option>)}</select></label>
        <label>Muscle part<select value={part} onChange={event => setPart(event.target.value)}><option value="all">All parts</option>{availableParts.map(value => <option key={value.id} value={value.id}>{value.label}</option>)}</select></label>
      </div>
      <p className="muted small-text picker-help">Includes primary and secondary muscles.</p>
      <div className="row between picker-results"><p className="picker-count" role="status" aria-atomic="true">{filtered.length} {filtered.length === 1 ? 'exercise' : 'exercises'} · {selected.length} selected{selected.length >= limit ? ' · Limit reached' : ''}</p>{hasFilters && filtered.length > 0 && <button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}</div>
    </div>
    <div className="picker-list">{filtered.length ? filtered.map(exercise => <div key={exercise.id} className={`exercise-option ${selected.includes(exercise.id) ? 'selected' : ''}`}>
      <label className="exercise-select-control"><input id={`pick-${exercise.id}`} aria-labelledby={`pick-name-${exercise.id}`} type="checkbox" disabled={selected.length >= limit && !selected.includes(exercise.id)} checked={selected.includes(exercise.id)} onChange={event => setSelected(current => event.target.checked ? [...current, exercise.id] : current.filter(id => id !== exercise.id))}/></label>
      <div className="exercise-option-content"><label id={`pick-name-${exercise.id}`} htmlFor={`pick-${exercise.id}`}><strong>{exercise.name}</strong></label><MuscleLabels exercise={exercise}/><small className="muted equipment-label">{exercise.equipment}</small></div>
    </div>) : <div className="picker-empty"><p>{hasFilters ? 'No exercises match your search or filters.' : 'No exercises available yet.'}</p>{hasFilters && <button type="button" className="text-button" onClick={clearFilters}>Clear filters</button>}</div>}</div>
    </div>
    <div className="picker-footer"><button type="button" className="button primary wide" disabled={!selected.length} onClick={() => { onAdd(selected.map(id => catalog.find(exercise => exercise.id === id)).filter(Boolean)); onClose(); }}>{selected.length ? `Add ${selected.length} exercise${selected.length === 1 ? '' : 's'}` : 'Select exercises to add'}</button></div>
  </dialog>;
}
