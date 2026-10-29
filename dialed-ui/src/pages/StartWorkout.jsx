import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { workoutSchema } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { draft, drafts, discardDraft, saveDraft, syncDrafts, adoptCloudVersion, separateCopy } from '../lib/offline';
import { emptySet, hasEnteredSets, inProgress, isSetComplete, newWorkout, sessionExercise, downloadJson, previousWorkout, previousSets } from '../lib/models';
import ExercisePicker, { MuscleLabels } from '../components/ExercisePicker';
import SetEditor, { PrescriptionEditor } from '../components/SetEditor';
import Recommendation from '../components/Recommendation';

export default function StartWorkout() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { userId, rows, catalog, api, ready } = useTraining();
  const [workout, setWorkout] = useState(null);
  const [picker, setPicker] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingWrites, setPendingWrites] = useState(0);
  const [discarding, setDiscarding] = useState(false);
  const queue = useRef(Promise.resolve());
  const current = useRef(null);
  const mounted = useRef(true);
  const creation = useRef(null);
  const editRevision = useRef(0);
  const storageFailed = useRef(false);
  const row = rows.find(r => r.id === id);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    let cancelled = false;
    if (!ready) return;
    setError('');
    setWorkout(null);
    current.current = null;
    editRevision.current = 0;
    storageFailed.current = false;
    (async () => {
      if (!id) {
        // Reuse the same creation during StrictMode's setup/cleanup/setup cycle.
        creation.current ??= (async () => {
          // Only one session runs at a time: resume it rather than starting another.
          const { current: resume } = inProgress(await drafts(userId));
          if (resume) return resume.workout;
          const value = newWorkout(null, []);
          await saveDraft(userId, value);
          return value;
        })();
        const value = await creation.current;
        if (!cancelled) navigate(`/start-workout/${value.id}`, { replace: true });
        return;
      }
      creation.current = null;
      const stored = await draft(userId, id);
      if (cancelled) return;
      if (stored && stored.state !== 'discarded') { current.current = stored.workout; setWorkout(stored.workout); }
      else setError('This workout isn’t on this device yet. Sync your account, then open it from History.');
    })().catch(err => { if (!cancelled) setError(err.message); });
    return () => { cancelled = true; };
  }, [id, userId, ready, navigate]);

  useEffect(() => {
    if (!current.current || current.current.id !== id || !row) return;
    const version = Math.max(row.serverVersion ?? 0, current.current.version);
    // A sync response can be older than a keystroke waiting in the local save queue.
    // After the first edit, only adopt server metadata; keep the editor's own content.
    const value = row.state === 'synced' && editRevision.current === 0 && pendingWrites === 0
      ? row.workout : { ...current.current, version };
    current.current = value;
    setWorkout(value);
  }, [id, row, pendingWrites]);

  useEffect(() => {
    const protectUnsaved = event => {
      if (pendingWrites || storageFailed.current) { event.preventDefault(); event.returnValue = ''; }
    };
    window.addEventListener('beforeunload', protectUnsaved);
    return () => window.removeEventListener('beforeunload', protectUnsaved);
  }, [pendingWrites]);

  function change(update) {
    if (busy) return;
    const next = typeof update === 'function' ? update(current.current) : update;
    editRevision.current += 1;
    current.current = next;
    setWorkout(next);
    setPendingWrites(count => count + 1);
    queue.current = queue.current.catch(() => {}).then(async () => {
      try {
        await saveDraft(userId, next);
        storageFailed.current = false;
        if (mounted.current) setError('');
      } catch (err) {
        storageFailed.current = true;
        if (mounted.current) setError(`Device storage failed: ${err.message}. Keep this page open and download your draft.`);
      } finally {
        if (mounted.current) setPendingWrites(count => Math.max(0, count - 1));
      }
    });
  }

  function changeExercise(exerciseId, update) {
    change(value => ({ ...value, exercises: value.exercises.map(exercise => exercise.id === exerciseId ? update(exercise) : exercise) }));
  }

  async function complete() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await queue.current;
      const value = workoutSchema.parse({ ...current.current, status: 'completed', completedAt: new Date().toISOString(),
        exercises: current.current.exercises.map(exercise => ({ ...exercise, sets: exercise.sets.map(set => ({ ...set, completed: isSetComplete(set) })) })) });
      // Persist the entire latest value again, including any earlier failed device save.
      await saveDraft(userId, value);
      storageFailed.current = false;
      void syncDrafts(userId, api).catch(() => {});
      navigate(`/workout/${value.id}`);
    } catch (err) {
      setError(err.issues?.map(issue => issue.message).join('; ') ?? err.message);
    } finally { setBusy(false); }
  }

  async function discard() {
    if (busy) return;
    setBusy(true); setError('');
    try {
      await queue.current;
      await discardDraft(userId, id);
      void syncDrafts(userId, api).catch(() => {});
      navigate('/', { replace: true });
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  async function resolve(copy) {
    setBusy(true); setError('');
    try {
      await queue.current;
      if (copy) {
        const recovered = separateCopy(current.current);
        await saveDraft(userId, recovered);
        await adoptCloudVersion(userId, id, api);
        void syncDrafts(userId, api).catch(() => {});
        navigate(`/start-workout/${recovered.id}`);
      } else {
        const cloud = await adoptCloudVersion(userId, id, api);
        editRevision.current = 0;
        storageFailed.current = false;
        current.current = cloud;
        setWorkout(cloud);
      }
    } catch (err) { setError(err.message); } finally { setBusy(false); }
  }

  if (!workout) return <div className="notice" role="status">{error || 'Opening your workout…'}{error && <p><Link className="text-button" to="/">Return to overview →</Link></p>}</div>;
  if (workout.status === 'completed') return <div className="panel stack"><h1>Workout complete</h1><p>Your workout is saved and ready to review.</p><Link className="button" to={`/workout/${workout.id}`}>View workout</Link></div>;

  const sets = workout.exercises.flatMap(exercise => exercise.sets).filter(set => !set.warmup);
  const completedSets = sets.filter(isSetComplete).length;
  const previous = previousWorkout(workout, rows);
  const savedMessage = storageFailed.current ? 'Device save needs attention' : pendingWrites ? 'Saving to this device…' : row?.state === 'conflict' ? 'Saved on this device · review sync conflict' : row?.state === 'synced' ? 'Saved to your account' : 'Saved on this device · waiting to sync';
  return <>
    <div className="page-heading session-heading"><div className="eyebrow">SHOW UP. PUT IN THE WORK.</div><h1>Workout in progress</h1><p role="status" aria-live="polite">{savedMessage}</p></div>
    <div className="session-progress" role="progressbar" aria-label="Working sets logged" aria-valuemin={0} aria-valuemax={Math.max(sets.length, 1)} aria-valuenow={completedSets} aria-valuetext={`${completedSets} of ${sets.length} working sets logged`}><span><strong>{completedSets}</strong> / {sets.length} working sets</span><div className="progress-track"><div style={{ width: `${sets.length ? completedSets / sets.length * 100 : 0}%` }}/></div></div>
    <label>Workout name<input autoComplete="off" enterKeyHint="done" value={workout.name} maxLength={120} disabled={busy} onChange={event => change(value => ({ ...value, name: event.target.value }))}/></label>
    {(error || row?.error) && <div className="notice error" role="alert"><p>{error || row.error}</p><button className="text-button" onClick={() => downloadJson(current.current, 'dialed-draft.json')}>Download local draft</button></div>}
    {row?.state === 'conflict' && <div className="notice"><p>This workout changed on another device. Use the account version or keep this draft as a separate workout. A backup of this device’s version is available in Settings.</p><div className="row wrap"><button className="button" disabled={busy} onClick={() => resolve(false)}>Use account version</button><button className="button" disabled={busy} onClick={() => resolve(true)}>Keep as separate workout</button></div></div>}
    <fieldset className="session-fields" disabled={busy}><legend className="sr-only">Workout exercises and sets</legend>
      <div className="stack section-gap">{workout.exercises.map((exercise, index) => {
        const priorSets = previousSets(workout, index, previous);
        return <section className="panel exercise-card" key={exercise.id}>
        <div className="row between"><span className="eyebrow">EXERCISE {String(index + 1).padStart(2, '0')}</span><button className="text-button" aria-label={`Remove ${exercise.snapshot.name}`} onClick={() => change(value => ({ ...value, exercises: value.exercises.filter(item => item.id !== exercise.id) }))}>Remove</button></div>
        <h2>{exercise.snapshot.name}</h2><MuscleLabels exercise={exercise.snapshot}/>
        <p className="muted small-text">{exercise.snapshot.equipment === 'dumbbell' ? 'Log kg per dumbbell.' : exercise.snapshot.equipment === 'bodyweight' ? 'Log added weight; use 0 kg for bodyweight.' : 'Log the total working weight in kg.'}</p>
        <details className="targets"><summary>{exercise.prescription.workingSets ?? '—'} working {exercise.prescription.workingSets === 1 ? 'set' : 'sets'} · {exercise.prescription.repMin ?? '—'}–{exercise.prescription.repMax ?? '—'} reps · Edit targets</summary><PrescriptionEditor value={exercise.prescription} onChange={prescription => changeExercise(exercise.id, value => ({ ...value, prescription }))}/><p className="muted small-text">Changing targets keeps your logged sets. Add or remove sets below.</p></details>
        <Recommendation workout={{ ...workout, version: row?.serverVersion ?? workout.version }} synced={row?.state === 'synced' && !pendingWrites} exercise={exercise} onApply={weight => changeExercise(exercise.id, value => ({ ...value, sets: value.sets.map(set => !isSetComplete(set) && !set.warmup && set.weight === null ? { ...set, weight } : set) }))}/>
        <p className="muted small-text" id={`rir-help-${exercise.id}`}>RIR is optional: how many more reps you could have done.</p>
        <p className="muted small-text set-entry-help">{priorSets.some(Boolean) ? 'Faint values are from last time. ' : ''}Enter and leave the reps field to log a set.</p>
        <div className="set-heading" aria-hidden="true"><span>SET</span><span>KG</span><span>REPS</span><span>RIR</span></div>
        {exercise.sets.map((set, setIndex) => <SetEditor key={set.id} set={set} index={setIndex} previous={priorSets[setIndex]} rirHelpId={`rir-help-${exercise.id}`} onChange={updated => changeExercise(exercise.id, value => ({ ...value, sets: value.sets.map(item => item.id === set.id ? updated : item) }))} onRemove={() => changeExercise(exercise.id, value => ({ ...value, sets: value.sets.filter(item => item.id !== set.id) }))}/>)}
        <button className="button dashed wide" disabled={exercise.sets.length >= 50} onClick={() => changeExercise(exercise.id, value => ({ ...value, sets: [...value.sets, emptySet()] }))}>+ Add set</button>
      </section>; })}</div>
      {!workout.exercises.length && <div className="empty"><span className="empty-symbol" aria-hidden="true">＋</span><h2>A fresh start</h2><p>Add your first exercise, or start from a saved routine.</p><Link className="text-button" to="/routines">Browse your routines →</Link></div>}
      <div className="stack section-gap"><button className="button dashed wide" disabled={workout.exercises.length >= 50} onClick={() => setPicker(true)}>+ Add exercise</button><p className="muted small-text">Warm-up sets are saved, but don’t count toward muscle summaries or weight suggestions.</p></div>
    </fieldset>
    <div className="session-finish"><span className="muted small-text">{completedSets ? `${completedSets} working set${completedSets === 1 ? '' : 's'} logged. Finish when you’re ready.` : 'Enter weight and reps, then leave the reps field to log your first set.'}</span><button className="button primary wide" disabled={busy || row?.state === 'conflict' || !workout.exercises.some(exercise => exercise.sets.some(isSetComplete))} onClick={complete}>{busy ? 'Saving workout…' : 'Complete workout ✓'}</button>
      {row?.state !== 'conflict' && (discarding
        ? <div className="notice"><p>Discard this workout? {hasEnteredSets(workout) ? 'The sets you’ve entered will be deleted.' : 'Nothing has been entered yet.'}</p><div className="row wrap"><button className="button" disabled={busy} onClick={discard}>Discard workout</button><button className="text-button" disabled={busy} onClick={() => setDiscarding(false)}>Keep workout</button></div></div>
        : <button className="text-button" disabled={busy} onClick={() => setDiscarding(true)}>Discard workout</button>)}</div>
    {picker && <ExercisePicker catalog={catalog} limit={50 - workout.exercises.length} onClose={() => setPicker(false)} onAdd={items => change(value => ({ ...value, exercises: [...value.exercises, ...items.map(exercise => sessionExercise(exercise))] }))}/>}
  </>;
}
