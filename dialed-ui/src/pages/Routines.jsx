import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { routineSchema } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { cached, saveDraft, syncDrafts } from '../lib/offline';
import { newWorkout, routineExercise } from '../lib/models';
import ExercisePicker, { MuscleLabels } from '../components/ExercisePicker';
import { PrescriptionEditor } from '../components/SetEditor';

export default function Routines() {
  const { catalog, routines, userId, api, refresh, online, ready } = useTraining();
  const navigate = useNavigate();
  const [editing, setEditing] = useState(null);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [discarding, setDiscarding] = useState(false);
  const starting = useRef(false);

  async function start(routine) {
    if (starting.current) return;
    starting.current = true; setBusy(true); setError('');
    try {
      const workout = newWorkout(routine, catalog);
      await saveDraft(userId, workout);
      void syncDrafts(userId, api).catch(() => {});
      navigate(`/start-workout/${workout.id}`);
    } catch (err) { setError(err.message); } finally { starting.current = false; setBusy(false); }
  }

  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const parsed = routineSchema.safeParse(editing);
      if (!parsed.success) throw new Error(parsed.error.issues.map(issue => issue.message).join('; '));
      const saved = await api.saveRoutine(parsed.data);
      await cached(userId, 'routines', [...routines.filter(routine => routine.id !== saved.id), saved]);
      setEditing(null);
      await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function remove(routine) {
    setBusy(true); setError('');
    try {
      await api.deleteRoutine(routine);
      await cached(userId, 'routines', routines.filter(value => value.id !== routine.id));
      setDeleting(null);
      await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  function beginEdit(value) { setError(''); setDiscarding(false); setEditing(value); }
  if (!ready) return <p className="notice" role="status">Loading your routines…</p>;
  if (editing) return <>
    <div className="page-heading"><div className="eyebrow">YOUR TRAINING PLAN</div><h1>{editing.version ? 'Edit routine' : 'Build a routine'}</h1><p>Set your targets. Make the next session easy to start.</p></div>
    <form onSubmit={save} className="stack">
      <fieldset className="session-fields stack" disabled={busy}>
        <label>Routine name<input required maxLength={120} autoFocus placeholder="e.g. Upper body A" value={editing.name} onChange={event => setEditing({ ...editing, name: event.target.value })}/></label>
        {editing.exercises.map((item, index) => {
          const exercise = catalog.find(value => value.id === item.exerciseId);
          return <section className="panel stack" key={item.id}>
            <div className="row between"><div><div className="eyebrow">EXERCISE {String(index + 1).padStart(2, '0')}</div><h2>{exercise?.name ?? 'Unavailable exercise'}</h2></div><button type="button" className="text-button" aria-label={`Remove ${exercise?.name ?? 'exercise'}`} onClick={() => setEditing({ ...editing, exercises: editing.exercises.filter(value => value.id !== item.id) })}>Remove</button></div>
            {exercise && <MuscleLabels exercise={exercise}/>}
            <PrescriptionEditor value={item.prescription} onChange={prescription => setEditing({ ...editing, exercises: editing.exercises.map((value, position) => position === index ? { ...value, prescription } : value) })}/>
          </section>;
        })}
        {!editing.exercises.length && <div className="empty"><h2>Your plan starts here</h2><p>Add exercises, then choose your working sets and rep range.</p></div>}
        <button type="button" className="button dashed" disabled={editing.exercises.length >= 50} onClick={() => setPicker(true)}>+ Add exercise</button>
      </fieldset>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!online && <p className="notice">Connect to save a routine. Keep this page open to retain these edits.</p>}
      {discarding && <div className="notice"><p>Discard the changes on this screen?</p><div className="row"><button type="button" className="text-button" onClick={() => { setEditing(null); setError(''); }}>Discard changes</button><button type="button" className="text-button" onClick={() => setDiscarding(false)}>Keep editing</button></div></div>}
      <div className="row"><button type="button" className="button" disabled={busy} onClick={() => setDiscarding(true)}>Cancel</button><button className="button primary" disabled={busy || !online || !editing.exercises.length}>{busy ? 'Saving…' : 'Save routine'}</button></div>
    </form>
    {picker && <ExercisePicker catalog={catalog} limit={50 - editing.exercises.length} onClose={() => setPicker(false)} onAdd={items => setEditing({ ...editing, exercises: [...editing.exercises, ...items.map(routineExercise)] })}/>}
  </>;
  return <>
    <div className="page-heading"><div className="eyebrow">BUILT AROUND YOU</div><h1>Your routines</h1><p>A familiar plan. A fresh session every time.</p></div>
    <button className="button primary" onClick={() => beginEdit({ id: crypto.randomUUID(), name: '', version: 0, exercises: [] })}>+ Create routine</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="stack section-gap">{routines.length ? routines.map(routine => <section className="panel routine-card" key={routine.id}>
      <div className="eyebrow">{routine.exercises.length} EXERCISES · {routine.exercises.reduce((total, exercise) => total + exercise.prescription.workingSets, 0)} WORKING SETS</div>
      <h2>{routine.name}</h2>
      <p className="muted routine-preview">{routine.exercises.map(exercise => catalog.find(value => value.id === exercise.exerciseId)?.name ?? 'Unavailable exercise').join(' · ')}</p>
      <div className="row wrap"><button className="button primary" disabled={busy} onClick={() => start(routine)}>Start session ↗</button><button className="text-button" disabled={busy} onClick={() => beginEdit(structuredClone(routine))}>Edit</button><button className="text-button" disabled={busy} onClick={() => setDeleting(routine.id)}>Delete</button></div>
      {deleting === routine.id && <div className="notice"><p>Delete this routine? Your workout history will remain.</p><div className="row wrap"><button className="button" disabled={busy || !online} onClick={() => remove(routine)}>Delete routine</button><button className="text-button" disabled={busy} onClick={() => setDeleting(null)}>Keep routine</button></div>{!online && <p>Connect to delete a routine.</p>}</div>}
    </section>) : <div className="empty"><span className="empty-symbol" aria-hidden="true">＋</span><h2>Make it your routine</h2><p>Choose exercises and rep targets, then reuse your plan each session.</p></div>}</div>
  </>;
}
