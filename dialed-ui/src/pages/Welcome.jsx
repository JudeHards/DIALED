import { Link } from 'react-router-dom';
import { weeklySummary } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import WeeklyMuscles from '../components/WeeklyMuscles';
import { inProgress } from '../lib/models';
export default function Welcome() {
  const { rows, timezone, routines } = useTraining();
  const history = rows.map(r => r.workout); const summary = weeklySummary(history, timezone);
  const { current, sessions: active } = inProgress(rows);
  const completed = history.filter(w => w.status === 'completed');
  const total = summary.totalWorkingSets;
  return <><section className="hero"><div className="eyebrow">YOUR TRAINING, SIMPLIFIED</div><h1>Build on<br/><em>your last rep.</em></h1><p>Log your workouts, follow your progress, and know what to aim for next.</p><Link className="button primary" to={current ? `/start-workout/${current.id}` : '/start-workout'}>{current ? 'Continue workout' : 'Start a workout'} <span aria-hidden="true">↗</span></Link><div className="hero-mark" aria-hidden="true">D/</div></section>
    <div className="stats"><div><strong>{total}</strong><span>working sets this week</span></div><div><strong>{completed.length}</strong><span>{completed.length === 1 ? 'workout logged' : 'workouts logged'}</span></div><div><strong>{routines.length}</strong><span>{routines.length === 1 ? 'saved routine' : 'saved routines'}</span></div></div>
    {active.length > 0 && <section className="section-gap"><div className="section-title"><h2>Continue your workout</h2></div><div className="stack">{active.map(row => <Link className="panel history-card" key={row.id} to={`/start-workout/${row.id}`}><div><h3>{row.workout.name}</h3><p className="muted">{row.state === 'conflict' ? 'Needs review · Saved on this device' : `${row.workout.exercises.length} ${row.workout.exercises.length === 1 ? 'exercise' : 'exercises'} · In progress`}</p></div><span aria-hidden="true">↗</span></Link>)}</div></section>}
    <WeeklyMuscles summary={summary} timezone={timezone}/><div className="row wrap section-gap"><Link className="button" to="/routines">View routines <span aria-hidden="true">→</span></Link><Link className="button" to="/workout">View history <span aria-hidden="true">→</span></Link></div>
  </>;
}
