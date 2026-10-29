import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { profileSchema } from '@dialed/shared';
import { useTraining } from '../lib/Training';
import { useAuth } from '../lib/Auth';
import { supabase } from '../lib/supabase';
import { cached, recoveries, saveDraft, syncDrafts, separateCopy } from '../lib/offline';
import { downloadJson, legacyRecords, recoverLegacy } from '../lib/models';
export default function Settings() {
  const { timezone, userId, api, catalog, rows, refresh } = useTraining(); const { user } = useAuth(); const navigate = useNavigate();
  const [zone, setZone] = useState(timezone); const [message, setMessage] = useState(''); const [archives, setArchives] = useState([]); const [legacy] = useState(() => legacyRecords()); const [review, setReview] = useState(null);
  const pendingCount = rows.filter(row => row.state !== 'synced').length;
  useEffect(() => { recoveries(userId).then(setArchives); }, [userId]);
  useEffect(() => { setZone(timezone); }, [timezone]);
  async function saveZone(event) { event.preventDefault(); try { const value = profileSchema.parse({ timezone: zone }); await cached(userId, 'profile', await api.saveProfile(value.timezone)); await refresh(); setMessage('Time zone saved.'); } catch (err) { setMessage(err.issues?.[0]?.message ?? err.message); } }
  async function importReview() { try { await saveDraft(userId, review); void syncDrafts(userId, api); navigate(`/start-workout/${review.id}`); } catch (err) { setMessage(err.message); } }
  return <><div className="page-heading"><div className="eyebrow">YOUR ACCOUNT</div><h1>Settings</h1><p>{user.email}</p></div><form className="panel stack" onSubmit={saveZone}><h2>Training preferences</h2><p className="muted">Weights are in kilograms (kg). For dumbbells, log the weight of one dumbbell.</p><label>Time zone<input value={zone} onChange={e => setZone(e.target.value)} placeholder="e.g. Europe/Dublin" autoCapitalize="none" autoComplete="off" spellCheck={false} aria-describedby="timezone-help" required/></label><small className="muted" id="timezone-help">Use a time zone such as Europe/Dublin. Your training week runs Monday–Sunday in this time zone.</small><button className="button">Save preferences</button></form>
    {message && <p className="notice" role="status">{message}</p>}
    <section className="panel stack section-gap"><h2>Device storage</h2><p>{pendingCount ? `${pendingCount} ${pendingCount === 1 ? 'workout needs' : 'workouts need'} to sync or be reviewed.` : rows.length ? 'All workouts on this device are saved to your account.' : 'No workouts saved on this device yet.'}</p><p className="muted">Drafts are saved on this device for this account. Sign back in to this account to sync them. Clearing browser data removes workouts that haven’t synced.</p><button className="button" onClick={() => downloadJson(rows.map(r => r.workout), 'dialed-workouts.json')}>Export workouts on this device</button><button className="button" onClick={() => refresh()}>Sync now</button></section>
    {(legacy.length > 0 || archives.length > 0) && <section className="panel stack section-gap"><h2>Recover earlier workouts</h2><p className="muted">Review earlier workouts and recovery copies before adding them to this account. Your original copies will be kept.</p>{legacy.map(record => <div className="recovery-row" key={record.key}><strong>{record.value?.name || record.value?.workoutName || 'Earlier workout'}</strong><p className="muted small-text">{record.error || 'Saved on this device'}</p><div className="row wrap"><button className="text-button" onClick={() => downloadJson(record, 'dialed-legacy.json')}>Download original</button>{!record.error && <button className="text-button" onClick={() => { try { setReview(recoverLegacy(record,catalog)); } catch (err) { setMessage(err.message); } }}>Review workout</button>}</div></div>)}
      {archives.map(record => <div className="recovery-row" key={record.id}><strong>{record.workout.name}</strong><p className="muted small-text">Recovery copy · Saved on this device</p><div className="row wrap"><button className="text-button" onClick={() => downloadJson(record.workout,'dialed-archive.json')}>Download copy</button><button className="text-button" onClick={() => setReview({ ...separateCopy(record.workout), status: 'in_progress', completedAt: null })}>Review workout</button></div></div>)}
      {review && <div className="notice"><h3>{review.name}</h3><p>{review.exercises.map(e => `${e.snapshot.name}: ${e.sets.length} ${e.sets.length === 1 ? 'set' : 'sets'}`).join(' · ')}</p><p>This adds an editable workout to the account for {user.email}.</p><div className="row wrap"><button className="button primary" onClick={importReview}>Add workout</button><button className="text-button" onClick={() => setReview(null)}>Cancel</button></div></div>}
    </section>}
    <button className="button section-gap" onClick={async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setMessage(error.message); }}>Sign out</button>
  </>;
}
