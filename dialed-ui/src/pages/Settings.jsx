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
  useEffect(() => { recoveries(userId).then(setArchives); }, [userId]);
  useEffect(() => { setZone(timezone); }, [timezone]);
  async function saveZone(event) { event.preventDefault(); try { const value = profileSchema.parse({ timezone: zone }); await cached(userId, 'profile', await api.saveProfile(value.timezone)); await refresh(); setMessage('Timezone saved.'); } catch (err) { setMessage(err.issues?.[0]?.message ?? err.message); } }
  async function importReview() { try { await saveDraft(userId, review); void syncDrafts(userId, api); navigate(`/start-workout/${review.id}`); } catch (err) { setMessage(err.message); } }
  return <><div className="page-heading"><div className="eyebrow">YOUR ACCOUNT</div><h1>Settings</h1><p>{user.email}</p></div><form className="panel stack" onSubmit={saveZone}><h2>Training preferences</h2><p className="muted">Weights use kilograms. Dumbbell weights are per dumbbell.</p><label>Timezone<input value={zone} onChange={e => setZone(e.target.value)} placeholder="Europe/Dublin" required/></label><small className="muted">Weekly summaries run Monday–Sunday in this timezone.</small><button className="button">Save preferences</button></form>
    {message && <p className="notice" role="status">{message}</p>}
    <section className="panel stack section-gap"><h2>Device storage</h2><p>{rows.filter(r => r.state !== 'synced').length} session(s) waiting to sync or review.</p><p className="muted">Drafts stay on this browser and are separated by account. Sign back into this account to sync them. Clearing browser data removes local-only records.</p><button className="button" onClick={() => downloadJson(rows.map(r => r.workout), 'dialed-workouts.json')}>Export this account’s workouts</button><button className="button" onClick={() => refresh()}>Retry sync</button></section>
    {(legacy.length > 0 || archives.length > 0) && <section className="panel stack section-gap"><h2>Recover earlier records</h2><p className="muted">Review unassigned records before adding them to this account. Original records remain untouched.</p>{legacy.map(record => <div className="recovery-row" key={record.key}><strong>{record.value?.name || record.value?.workoutName || 'Earlier workout'}</strong><p className="muted small-text">{record.error || record.key}</p><div className="row"><button className="text-button" onClick={() => downloadJson(record, 'dialed-legacy.json')}>Download original</button>{!record.error && <button className="text-button" onClick={() => { try { setReview(recoverLegacy(record,catalog)); } catch (err) { setMessage(err.message); } }}>Review import</button>}</div></div>)}
      {archives.map(record => <div className="recovery-row" key={record.id}><strong>{record.workout.name} · conflict archive</strong><div className="row"><button className="text-button" onClick={() => downloadJson(record.workout,'dialed-archive.json')}>Download</button><button className="text-button" onClick={() => setReview({ ...separateCopy(record.workout), status: 'in_progress', completedAt: null })}>Review recovery</button></div></div>)}
      {review && <div className="notice"><h3>{review.name}</h3><p>{review.exercises.map(e => `${e.snapshot.name}: ${e.sets.length} sets`).join(' · ')}</p><p>This will create an editable draft in {user.email}.</p><button className="button primary" onClick={importReview}>Import reviewed draft</button><button className="text-button" onClick={() => setReview(null)}>Cancel</button></div>}
    </section>}
    <button className="button section-gap" onClick={async () => { const { error } = await supabase.auth.signOut({ scope: 'local' }); if (error) setMessage(error.message); }}>Sign out</button>
  </>;
}
