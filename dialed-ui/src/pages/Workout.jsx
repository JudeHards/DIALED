import { Link, useNavigate, useParams } from 'react-router-dom';
import { useState } from 'react';
import { useTraining } from '../lib/Training';
import { MuscleLabels } from '../components/ExercisePicker';
import { downloadJson } from '../lib/models';
import { useCloudVersion, separateCopy, saveDraft, syncDrafts } from '../lib/offline';
export default function Workout() {
  const { id } = useParams(); const { rows, ready, userId, api } = useTraining(); const navigate = useNavigate(); const [error, setError] = useState('');
  const list = rows.filter(r => r.workout.status === 'completed').sort((a,b) => b.workout.completedAt.localeCompare(a.workout.completedAt));
  if (id) {
    const row = rows.find(r => r.id === id); const workout = row?.workout;
    if (!workout) return <p className="notice">{ready ? 'Workout not found. Sync your account or return to History.' : 'Loading…'}</p>;
    async function resolve(copy) {
      try { if (copy) { const next = separateCopy(workout); await saveDraft(userId, next); await useCloudVersion(userId, id, api); void syncDrafts(userId, api); navigate(`/workout/${next.id}`); } else await useCloudVersion(userId, id, api); } catch (err) { setError(err.message); }
    }
    return <><Link className="text-button" to="/workout">← History</Link><div className="page-heading"><div className="eyebrow">{workout.status === 'completed' ? 'WORK PUT IN' : 'SESSION DRAFT'}</div><h1>{workout.name}</h1><p>{new Date(workout.completedAt ?? workout.startedAt).toLocaleString()}</p></div><div className="notice">{row.state === 'synced' ? 'Saved to your account.' : 'Saved on this device. Waiting to sync.'}{row.error && <p>{row.error}</p>}</div>{error && <p className="notice error">{error}</p>}
      {row.state === 'conflict' && <div className="row wrap"><button className="button" onClick={() => resolve(false)}>Use cloud version</button><button className="button" onClick={() => resolve(true)}>Save local as separate session</button></div>}
      {row.state !== 'synced' && <button className="text-button" onClick={() => downloadJson(workout, 'dialed-workout.json')}>Download local copy</button>}
      {workout.status === 'in_progress' && <Link className="button primary" to={`/start-workout/${id}`}>Continue workout</Link>}
      <div className="stack section-gap">{workout.exercises.map(e => <section className="panel" key={e.id}><h2>{e.snapshot.name}</h2><MuscleLabels exercise={e.snapshot}/><p className="muted small-text">Target: {e.prescription.workingSets} sets × {e.prescription.repMin}–{e.prescription.repMax} reps</p><table className="set-table"><thead><tr><th>Set</th><th>kg</th><th>Reps</th><th>RIR</th><th>Status</th></tr></thead><tbody>{e.sets.map((s,i) => <tr key={s.id}><td>{i + 1}{s.warmup ? ' · W' : ''}</td><td>{s.weight ?? '—'}</td><td>{s.reps ?? '—'}</td><td>{s.rir ?? '—'}</td><td>{s.completed ? '✓' : 'Skipped'}</td></tr>)}</tbody></table></section>)}</div>
    </>;
  }
  return <><div className="page-heading"><div className="eyebrow">YOUR CONSISTENCY, RECORDED</div><h1>Workout history</h1><p>Every session is a step you can build on.</p></div><div className="stack">{list.length ? list.map(row => <Link className="panel history-card" key={row.id} to={`/workout/${row.id}`}><div><div className="eyebrow">{new Date(row.workout.completedAt).toLocaleDateString(undefined,{ day:'numeric', month:'short', year:'numeric' })}</div><h2>{row.workout.name}</h2><p className="muted">{row.workout.exercises.length} exercises · {row.workout.exercises.flatMap(e => e.sets).filter(s => s.completed && !s.warmup).length} working sets{row.state !== 'synced' ? ' · On device' : ''}</p></div><span>↗</span></Link>) : <div className="empty"><h2>Your first session is ahead</h2><p>Complete a workout to see your history here.</p><Link className="button primary" to="/start-workout">Start a session</Link></div>}</div></>;
}
