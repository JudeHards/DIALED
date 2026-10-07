import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { routineSchema } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { cached, saveDraft, syncDrafts } from '../lib/offline';
import { newWorkout, routineExercise } from '../lib/models';
import ExercisePicker, { MuscleLabels } from '../components/ExercisePicker';
import { PrescriptionEditor } from '../components/SetEditor';
export default function Routines() {
  const { catalog, routines, userId, api, refresh, online } = useTraining();
  const navigate = useNavigate(); const [editing, setEditing] = useState(null); const [picker, setPicker] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false); const [deleting, setDeleting] = useState(null);
  async function start(routine) {
    try { const workout = newWorkout(routine, catalog); await saveDraft(userId, workout); void syncDrafts(userId, api); navigate(`/start-workout/${workout.id}`); } catch (err) { setError(err.message); }
  }
  async function save(event) {
    event.preventDefault(); setBusy(true); setError('');
    try {
      const parsed = routineSchema.safeParse(editing);
      if (!parsed.success) throw new Error(parsed.error.issues.map(i => i.message).join('; '));
      const saved = await api.saveRoutine(parsed.data);
      await cached(userId, 'routines', [...routines.filter(r => r.id !== saved.id), saved]);
      setEditing(null); await refresh();
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  async function remove(routine) {
    setBusy(true); try { await api.deleteRoutine(routine); await cached(userId, 'routines', routines.filter(r => r.id !== routine.id)); setDeleting(null); await refresh(); } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (editing) return <><div className="page-heading"><div className="eyebrow">YOUR TRAINING PLAN</div><h1>{editing.version ? 'Edit routine' : 'Build a routine'}</h1><p>Set your targets. Make the next session easy to start.</p></div>
    <form onSubmit={save} className="stack"><label>Routine name<input required maxLength={120} value={editing.name} onChange={e => setEditing({ ...editing, name: e.target.value })}/></label>
      {editing.exercises.map((item, index) => { const exercise = catalog.find(e => e.id === item.exerciseId); return <section className="panel stack" key={item.id}><div className="row between"><h2>{exercise?.name}</h2><button type="button" className="text-button" onClick={() => setEditing({ ...editing, exercises: editing.exercises.filter(e => e.id !== item.id) })}>Remove</button></div>{exercise && <MuscleLabels exercise={exercise}/>}<PrescriptionEditor value={item.prescription} onChange={prescription => setEditing({ ...editing, exercises: editing.exercises.map((e, i) => i === index ? { ...e, prescription } : e) })}/></section>; })}
      <button type="button" className="button dashed" onClick={() => setPicker(true)}>+ Add exercise</button>
      {error && <p className="notice error" role="alert">{error}</p>}
      {!online && <p className="notice">Routine editing needs a connection. Your edits remain on this screen.</p>}
      <div className="row"><button type="button" className="button" onClick={() => { setEditing(null); setError(''); }}>Cancel</button><button className="button primary" disabled={busy || !online}>{busy ? 'Saving…' : 'Save routine'}</button></div>
    </form>{picker && <ExercisePicker catalog={catalog} onClose={() => setPicker(false)} onAdd={items => setEditing({ ...editing, exercises: [...editing.exercises, ...items.map(routineExercise)] })}/>}</>;
  return <><div className="page-heading"><div className="eyebrow">BUILT AROUND YOU</div><h1>Your routines</h1><p>A familiar plan. A fresh session every time.</p></div>
    <button className="button primary" onClick={() => { setError(''); setEditing({ id: crypto.randomUUID(), name: '', version: 0, exercises: [] }); }}>+ Create routine</button>
    {error && <p className="notice error" role="alert">{error}</p>}
    <div className="stack section-gap">{routines.length ? routines.map(r => <section className="panel" key={r.id}><div className="eyebrow">{r.exercises.length} EXERCISES</div><h2>{r.name}</h2><p className="muted routine-preview">{r.exercises.map(e => catalog.find(c => c.id === e.exerciseId)?.name).join(' · ')}</p><div className="row wrap"><button className="button primary" onClick={() => start(r)}>Start session ↗</button><button className="text-button" onClick={() => { setError(''); setEditing(structuredClone(r)); }}>Edit</button><button className="text-button" onClick={() => setDeleting(r.id)}>Delete</button></div>{deleting === r.id && <div className="notice"><p>Delete this routine? Your workout history will remain.</p><div className="row"><button className="button" disabled={busy || !online} onClick={() => remove(r)}>Delete routine</button><button className="text-button" onClick={() => setDeleting(null)}>Keep routine</button></div></div>}</section>) : <div className="empty"><span className="empty-symbol">＋</span><h2>Make it your routine</h2><p>Choose exercises and rep targets, then reuse your plan each session.</p></div>}</div>
  </>;
}
