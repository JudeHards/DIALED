import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useTraining } from '../lib/Training';
import { MuscleLabels } from '../components/ExercisePicker';
import { downloadJson, isSetComplete } from '../lib/models';
import { adoptCloudVersion, separateCopy, saveDraft, syncDrafts } from '../lib/offline';
export default function Workout() {
  const { id } = useParams(); const { rows, ready, userId, api } = useTraining(); const navigate = useNavigate(); const [error, setError] = useState('');
  const list = rows.filter(r => r.workout.status === 'completed').sort((a,b) => b.workout.completedAt.localeCompare(a.workout.completedAt));
  if (id) {
    const row = rows.find(r => r.id === id); const workout = row?.workout;
    if (!workout) return <div className="notice" role="status"><p>{ready ? 'This workout isn’t on this device yet. Sync your account, then try again.' : 'Loading your workout…'}</p>{ready && <Link className="text-button" to="/workout">Back to history →</Link>}</div>;
    async function resolve(copy) {
      try { if (copy) { const next = separateCopy(workout); await saveDraft(userId, next); await adoptCloudVersion(userId, id, api); void syncDrafts(userId, api); navigate(`/workout/${next.id}`); } else await adoptCloudVersion(userId, id, api); } catch (err) { setError(err.message); }
    }
    return <><Link className="text-button" to="/workout">← Back to history</Link><div className="page-heading"><div className="eyebrow">{workout.status === 'completed' ? 'WORKOUT COMPLETE' : 'WORKOUT IN PROGRESS'}</div><h1>{workout.name}</h1><p><time dateTime={workout.completedAt ?? workout.startedAt}>{new Date(workout.completedAt ?? workout.startedAt).toLocaleString(undefined, { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</time></p></div><div className="notice" role="status">{row.state === 'synced' ? 'Saved to your account.' : row.state === 'conflict' ? 'Saved on this device. This workout changed on another device; choose which version to keep below.' : 'Saved on this device. Waiting to sync.'}{row.error && <p>{row.error}</p>}</div>{error && <p className="notice error" role="alert">{error}</p>}
      {row.state === 'conflict' && <div className="row wrap"><button type="button" className="button" onClick={() => resolve(false)}>Use account version</button><button type="button" className="button" onClick={() => resolve(true)}>Keep as separate workout</button></div>}
      {row.state !== 'synced' && <button className="text-button" onClick={() => downloadJson(workout, 'dialed-workout.json')}>Download local copy</button>}
      {workout.status === 'in_progress' && <Link className="button primary" to={`/start-workout/${id}`}>Continue workout</Link>}
      <div className="stack section-gap">{workout.exercises.map(e => <section className="panel" key={e.id}><h2>{e.snapshot.name}</h2><MuscleLabels exercise={e.snapshot}/><p className="muted small-text">Target: {e.prescription.workingSets} working {e.prescription.workingSets === 1 ? 'set' : 'sets'} · {e.prescription.repMin}–{e.prescription.repMax} reps</p><div className="set-table-scroll" role="region" aria-label={`${e.snapshot.name} sets`} tabIndex={0}><table className="set-table"><caption className="sr-only">Logged sets for {e.snapshot.name}. RIR means reps in reserve.</caption><thead><tr><th scope="col">Set</th><th scope="col">kg</th><th scope="col">Reps</th><th scope="col">RIR</th><th scope="col">Status</th></tr></thead><tbody>{e.sets.map((s,i) => <tr key={s.id}><th scope="row">{i + 1}{s.warmup && <span className="muted small-text"> · Warm-up</span>}</th><td>{s.weight ?? '—'}</td><td>{s.reps ?? '—'}</td><td>{s.rir ?? '—'}</td><td>{isSetComplete(s) ? <><span aria-hidden="true">✓</span><span className="sr-only">Logged</span></> : 'Not logged'}</td></tr>)}</tbody></table></div></section>)}</div>
    </>;
  }
  return <><div className="page-heading"><div className="eyebrow">YOUR CONSISTENCY, RECORDED</div><h1>Workout history</h1><p>Review your workouts and see how far you’ve come.</p></div><div className="stack">{!ready ? <p className="notice" role="status">Loading your workouts…</p> : list.length ? list.map(row => {
    const exerciseCount = row.workout.exercises.length;
    const setCount = row.workout.exercises.flatMap(e => e.sets).filter(s => isSetComplete(s) && !s.warmup).length;
    return <Link className="panel history-card" key={row.id} to={`/workout/${row.id}`}><div><div className="eyebrow"><time dateTime={row.workout.completedAt}>{new Date(row.workout.completedAt).toLocaleDateString(undefined,{ day:'numeric', month:'short', year:'numeric' })}</time></div><h2>{row.workout.name}</h2><p className="muted">{exerciseCount} {exerciseCount === 1 ? 'exercise' : 'exercises'} · {setCount} working {setCount === 1 ? 'set' : 'sets'}{row.state === 'conflict' ? ' · Needs review' : row.state !== 'synced' ? ' · Saved on this device' : ''}</p></div><span aria-hidden="true">↗</span></Link>;
  }) : <div className="empty"><h2>No completed workouts yet</h2><p>Complete a workout to see your exercises, sets and weights here.</p><Link className="button primary" to="/start-workout">Start a workout</Link></div>}</div></>;
}
