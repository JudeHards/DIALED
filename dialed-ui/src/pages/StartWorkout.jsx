import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { workoutSchema } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { draft, saveDraft, syncDrafts, useCloudVersion, separateCopy } from '../lib/offline';
import { emptySet, newWorkout, sessionExercise, downloadJson } from '../lib/models';
import ExercisePicker, { MuscleLabels } from '../components/ExercisePicker';
import SetEditor, { PrescriptionEditor } from '../components/SetEditor';
import Recommendation from '../components/Recommendation';
export default function StartWorkout() {
  const { id } = useParams(); const navigate = useNavigate();
  const { userId, rows, catalog, api, ready } = useTraining();
  const [workout, setWorkout] = useState(null); const [picker, setPicker] = useState(false); const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const queue = useRef(Promise.resolve()); const current = useRef(null); const mounted = useRef(true);
  const row = rows.find(r => r.id === id);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    if (!ready) return;
    (async () => {
      if (!id) {
        const value = newWorkout(null, []); await saveDraft(userId, value); if (!cancelled) navigate(`/start-workout/${value.id}`, { replace: true }); return;
      }
      const stored = await draft(userId, id);
      if (!cancelled && stored) { current.current = stored.workout; setWorkout(stored.workout); }
      else if (!cancelled) setError('Workout not found on this device. Open it from History after syncing.');
    })().catch(err => setError(err.message));
    return () => { cancelled = true; };
  }, [id, userId, ready, navigate]);
  // Adopt a clean cloud refresh, but never overwrite edits still being written locally.
  useEffect(() => {
    if (row?.state === 'synced' && row.workout.version > (current.current?.version ?? -1)) {
      current.current = row.workout; setWorkout(row.workout);
    }
  }, [row]);
  function change(next) {
    current.current = next; setWorkout(next); setError('');
    queue.current = queue.current.then(() => saveDraft(userId, next)).catch(err => { if (mounted.current) setError(`Device storage failed: ${err.message}. Keep this page open and download your draft.`); throw err; });
  }
  const changeExercise = (index, updated) => change({ ...current.current, exercises: current.current.exercises.map((e, i) => i === index ? updated : e) });
  async function complete() {
    setBusy(true); setError('');
    try {
      await queue.current;
      const value = workoutSchema.parse({ ...current.current, status: 'completed', completedAt: new Date().toISOString() });
      await saveDraft(userId, value); void syncDrafts(userId, api); navigate(`/workout/${value.id}`);
    } catch (err) { setError(err.issues?.map(i => i.message).join('; ') ?? err.message); } finally { setBusy(false); }
  }
  async function resolve(copy) {
    setBusy(true);
    try {
      await queue.current;
      if (copy) { const recovered = separateCopy(current.current); await saveDraft(userId, recovered); await useCloudVersion(userId, id, api); void syncDrafts(userId, api); navigate(`/start-workout/${recovered.id}`); }
      else { const cloud = await useCloudVersion(userId, id, api); current.current = cloud; setWorkout(cloud); }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }
  if (!workout) return <p className="notice">{error || 'Loading your session…'}</p>;
  if (workout.status === 'completed') return <div className="panel stack"><h1>Session complete</h1><p>Your completed session is read-only.</p><button className="button" onClick={() => navigate(`/workout/${workout.id}`)}>View workout</button></div>;
  return <><div className="page-heading"><div className="eyebrow">SHOW UP. PUT IN THE WORK.</div><h1>In session</h1><p>{row?.state === 'synced' ? 'Saved to your account' : 'Saved on this device · sync pending'}</p></div>
    <label>Session name<input value={workout.name} maxLength={120} onChange={e => change({ ...current.current, name: e.target.value })}/></label>
    {(error || row?.error) && <div className="notice error" role="alert"><p>{error || row.error}</p><button className="text-button" onClick={() => downloadJson(current.current, 'dialed-draft.json')}>Download local draft</button></div>}
    {row?.state === 'conflict' && <div className="notice"><p>Choose how to recover. Using the cloud version also archives your local draft in Settings.</p><div className="row wrap"><button className="button" disabled={busy} onClick={() => resolve(false)}>Use cloud version</button><button className="button" disabled={busy} onClick={() => resolve(true)}>Save local as separate session</button></div></div>}
    <div className="stack section-gap">{workout.exercises.map((exercise, index) => <section className="panel exercise-card" key={exercise.id}><div className="row between"><span className="eyebrow">EXERCISE {String(index + 1).padStart(2,'0')}</span><button className="text-button" onClick={() => change({ ...current.current, exercises: current.current.exercises.filter(e => e.id !== exercise.id) })}>Remove</button></div><h2>{exercise.snapshot.name}</h2><MuscleLabels exercise={exercise.snapshot}/><p className="muted small-text">{exercise.snapshot.equipment === 'dumbbell' ? 'Log kg per dumbbell.' : exercise.snapshot.equipment === 'bodyweight' ? 'Log added weight; use 0 kg for bodyweight.' : 'Log the total working weight in kg.'}</p>
      <details className="targets"><summary>{exercise.prescription.workingSets} working sets · {exercise.prescription.repMin}–{exercise.prescription.repMax} reps · Edit targets</summary><PrescriptionEditor value={exercise.prescription} onChange={prescription => changeExercise(index, { ...exercise, prescription })}/><p className="muted small-text">Changing the target count does not remove logged sets. Add or remove sets below.</p></details>
      <Recommendation workout={{ ...workout, version: row?.serverVersion ?? workout.version }} exercise={exercise} onApply={weight => changeExercise(index, { ...exercise, sets: exercise.sets.map(s => !s.completed && !s.warmup && s.weight === null ? { ...s, weight } : s) })}/>
      <div className="set-heading"><span>SET</span><span>KG</span><span>REPS</span><span>RIR <abbr title="Reps in reserve: how many more reps you felt you could do">?</abbr></span><span>DONE</span></div>
      {exercise.sets.map((set, si) => <SetEditor key={set.id} set={set} index={si} onChange={updated => changeExercise(index, { ...exercise, sets: exercise.sets.map(s => s.id === set.id ? updated : s) })} onRemove={() => changeExercise(index, { ...exercise, sets: exercise.sets.filter(s => s.id !== set.id) })}/>)}
      <button className="button dashed wide" onClick={() => changeExercise(index, { ...exercise, sets: [...exercise.sets, emptySet()] })}>+ Add set</button>
    </section>)}</div>
    {!workout.exercises.length && <div className="empty"><h2>A fresh start</h2><p>Add your first exercise, or start from a saved routine.</p></div>}
    <div className="stack section-gap"><button className="button dashed wide" onClick={() => setPicker(true)}>+ Add exercise</button><p className="muted small-text">RIR is optional: enter how many more reps you felt you could perform. Warm-ups do not count toward muscle summaries or progression.</p><button className="button primary wide" disabled={busy || row?.state === 'conflict'} onClick={complete}>{busy ? 'Saving…' : 'Complete workout'}</button></div>
    {picker && <ExercisePicker catalog={catalog} onClose={() => setPicker(false)} onAdd={items => change({ ...current.current, exercises: [...current.current.exercises, ...items.map(e => sessionExercise(e))] })}/>}
  </>;
}
