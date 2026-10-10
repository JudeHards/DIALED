import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { exercises } from '@dialed/shared';
import { apiFor } from './api';
import { cached, drafts, mergeRemote, syncDrafts } from './offline';
import { useAuth } from './Auth';

const TrainingContext = createContext(null);
// Older cached catalogues lack muscle targets. Start from the bundled catalogue
// until a current catalogue has been fetched; workout snapshots stay untouched.
const catalogCacheKey = 'catalog:delt-groups:v2';
const browserTimezone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
export function TrainingProvider({ children }) {
  const { user } = useAuth(); const userId = user.id;
  const api = useMemo(() => apiFor(userId), [userId]);
  const [catalog, setCatalog] = useState(exercises); const [routines, setRoutines] = useState([]); const [rows, setRows] = useState([]);
  const [timezone, setTimezone] = useState(browserTimezone);
  const [error, setError] = useState(''); const [ready, setReady] = useState(false); const [online, setOnline] = useState(navigator.onLine);
  const active = useRef(false); const localRead = useRef(0); const refreshing = useRef(null);
  const readLocal = useCallback(async () => {
    const sequence = ++localRead.current;
    const [list, routineList, exerciseList, profile] = await Promise.all([
      drafts(userId), cached(userId, 'routines'), cached(userId, catalogCacheKey), cached(userId, 'profile'),
    ]);
    if (!active.current || sequence !== localRead.current) return;
    setRows(list);
    if (routineList) setRoutines(routineList);
    if (exerciseList) setCatalog(exerciseList);
    if (profile) setTimezone(profile.timezone);
    setReady(true);
  }, [userId]);
  const refresh = useCallback(() => {
    if (refreshing.current) return refreshing.current;
    const run = async () => {
      await readLocal();
      if (!navigator.onLine) return;
      try {
        await syncDrafts(userId, api);
        const results = await Promise.allSettled([api.exercises(), api.routines(), api.workouts(), api.profile()]);
        const [catalogResult, routineResult, workoutResult, profileResult] = results;
        if (catalogResult.status === 'fulfilled') await cached(userId, catalogCacheKey, catalogResult.value);
        if (routineResult.status === 'fulfilled') await cached(userId, 'routines', routineResult.value);
        if (workoutResult.status === 'fulfilled') await mergeRemote(userId, workoutResult.value);
        if (profileResult.status === 'fulfilled') {
          const profile = profileResult.value ?? await api.saveProfile(browserTimezone());
          await cached(userId, 'profile', profile);
        }
        const failure = results.find(r => r.status === 'rejected');
        if (active.current) setError(failure ? failure.reason.message : '');
      } catch (err) { if (active.current) setError(err.message); }
      await readLocal();
    };
    refreshing.current = run().finally(() => { refreshing.current = null; });
    return refreshing.current;
  }, [api, userId, readLocal]);
  useEffect(() => {
    active.current = true; let timer;
    const report = err => { if (active.current) { setError(err.message); setReady(true); } };
    const changed = event => {
      if (event.detail?.userId && event.detail.userId !== userId) return;
      clearTimeout(timer);
      timer = setTimeout(() => { if (active.current) readLocal().catch(report); }, 80);
    };
    const connected = () => {
      setOnline(navigator.onLine);
      if (navigator.onLine) refresh().catch(report);
    };
    // A StrictMode remount can reuse the in-flight refresh; load local state
    // independently so an offline remount cannot stay on the loading screen.
    readLocal().catch(report);
    refresh().catch(report);
    const interval = setInterval(() => { if (navigator.onLine) syncDrafts(userId, api).catch(report); }, 10000);
    window.addEventListener('dialed:changed', changed);
    window.addEventListener('online', connected); window.addEventListener('offline', connected); window.addEventListener('focus', connected);
    return () => {
      active.current = false; localRead.current += 1;
      clearTimeout(timer); clearInterval(interval);
      window.removeEventListener('dialed:changed', changed);
      window.removeEventListener('online', connected); window.removeEventListener('offline', connected); window.removeEventListener('focus', connected);
    };
  }, [api, userId, refresh, readLocal]);
  return <TrainingContext.Provider value={{ userId, api, catalog, routines, rows, timezone, ready, online, error, refresh }}>{children}</TrainingContext.Provider>;
}
export function useTraining() { return useContext(TrainingContext); }
