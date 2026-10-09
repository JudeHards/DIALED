import { Link } from 'react-router-dom';
import { weeklySummary } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import WeeklyMuscles from '../components/WeeklyMuscles';
export default function Welcome() {
  const { rows, timezone, routines } = useTraining();
  const history = rows.map(r => r.workout); const summary = weeklySummary(history, timezone);
  const active = rows.filter(r => r.workout.status === 'in_progress');
  const completed = history.filter(w => w.status === 'completed');
  const total = summary.counts.reduce((n,c) => n + c.primarySets,0);
  return <><section className="hero"><div className="eyebrow">YOUR TRAINING, SIMPLIFIED</div><h1>Build on<br/><em>your last rep.</em></h1><p>Your log. Your progress. A clearer plan for what comes next.</p><Link className="button primary" to="/start-workout">Start a session <span>↗</span></Link><div className="hero-mark" aria-hidden="true">D/</div></section>
    <div className="stats"><div><strong>{total}</strong><span>working sets this week</span></div><div><strong>{completed.length}</strong><span>sessions logged</span></div><div><strong>{routines.length}</strong><span>saved routines</span></div></div>
    {active.length > 0 && <section className="section-gap"><div className="section-title"><h2>Pick up where you left off</h2></div><div className="stack">{active.map(row => <Link className="panel history-card" key={row.id} to={`/start-workout/${row.id}`}><div><h3>{row.workout.name}</h3><p className="muted">{row.state === 'conflict' ? 'Needs review · local draft retained' : `${row.workout.exercises.length} exercises · In progress`}</p></div><span>↗</span></Link>)}</div></section>}
    <WeeklyMuscles summary={summary} timezone={timezone}/><div className="row wrap section-gap"><Link className="button" to="/routines">Manage routines →</Link><Link className="button" to="/workout">View history →</Link></div>
  </>;
}
