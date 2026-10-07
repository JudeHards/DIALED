import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { exercises } from '@dialed/shared';
import { apiFor } from './api';
import { cached, drafts, mergeRemote, syncDrafts } from './offline';
import { useAuth } from './Auth';
const TrainingContext = createContext(null);
export function TrainingProvider({ children }) {
  const { user } = useAuth(); const userId = user.id;
  const api = useMemo(() => apiFor(userId), [userId]);
  const [catalog, setCatalog] = useState(exercises); const [routines, setRoutines] = useState([]); const [rows, setRows] = useState([]);
  const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
  const [error, setError] = useState(''); const [ready, setReady] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const readLocal = useCallback(async () => {
    const [list, routineList, exerciseList, profile] = await Promise.all([drafts(userId), cached(userId, 'routines'), cached(userId, 'catalog'), cached(userId, 'profile')]);
    setRows(list); if (routineList) setRoutines(routineList); if (exerciseList) setCatalog(exerciseList); if (profile) setTimezone(profile.timezone); setReady(true);
  }, [userId]);
  const refresh = useCallback(async () => {
    await readLocal();
    if (!navigator.onLine) return;
    try {
      await syncDrafts(userId, api);
      const [catalogResult, routineResult, workoutResult, profileResult] = await Promise.allSettled([api.exercises(), api.routines(), api.workouts(), api.profile()]);
      if (catalogResult.status === 'fulfilled') await cached(userId, 'catalog', catalogResult.value);
      if (routineResult.status === 'fulfilled') await cached(userId, 'routines', routineResult.value);
      if (workoutResult.status === 'fulfilled') await mergeRemote(userId, workoutResult.value);
      if (profileResult.status === 'fulfilled') {
        const profile = profileResult.value ?? await api.saveProfile(Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
        await cached(userId, 'profile', profile);
      }
      const failure = [catalogResult, routineResult, workoutResult, profileResult].find(r => r.status === 'rejected');
      setError(failure ? failure.reason.message : '');
    } catch (err) { setError(err.message); }
    await readLocal();
  }, [api, userId, readLocal]);
  useEffect(() => {
    let stopped = false; let timer;
    const changed = () => { clearTimeout(timer); timer = setTimeout(() => { if (!stopped) readLocal().catch(e => setError(e.message)); }, 80); };
    const connected = () => { setOnline(navigator.onLine); if (navigator.onLine) refresh().catch(e => setError(e.message)); };
    refresh().catch(e => { setError(e.message); setReady(true); });
    const interval = setInterval(() => { if (navigator.onLine) syncDrafts(userId, api).catch(e => setError(e.message)); }, 10000);
    window.addEventListener('dialed:changed', changed); window.addEventListener('online', connected); window.addEventListener('offline', connected); window.addEventListener('focus', connected);
    return () => { stopped = true; clearTimeout(timer); clearInterval(interval); window.removeEventListener('dialed:changed', changed); window.removeEventListener('online', connected); window.removeEventListener('offline', connected); window.removeEventListener('focus', connected); };
  }, [api, userId, refresh, readLocal]);
  return <TrainingContext.Provider value={{ userId, api, catalog, routines, rows, timezone, ready, online, error, refresh }}>{children}</TrainingContext.Provider>;
}
export function useTraining() { return useContext(TrainingContext); }
