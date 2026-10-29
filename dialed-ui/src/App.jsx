import { lazy, Suspense, useEffect, useState } from 'react';
import { NavLink, Routes, Route, Navigate, useLocation, useNavigationType } from 'react-router-dom';
import { ChartNoAxesColumn, History, ListChecks } from 'lucide-react';
import { AuthProvider, AuthScreen, useAuth } from './lib/Auth';
import { TrainingProvider, useTraining } from './lib/Training';
const Welcome = lazy(() => import('./pages/Welcome'));
const Routines = lazy(() => import('./pages/Routines'));
const Workout = lazy(() => import('./pages/Workout'));
const StartWorkout = lazy(() => import('./pages/StartWorkout'));
const Settings = lazy(() => import('./pages/Settings'));
function Shell() {
  const { online, error, rows } = useTraining(); const pending = rows.filter(r => r.state !== 'synced').length;
  const { pathname } = useLocation();
  const navigationType = useNavigationType();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      const editing = document.activeElement?.matches('input:not([type=checkbox]):not([type=radio]),textarea,select');
      setKeyboardOpen(Boolean(editing && viewport.scale === 1 && window.innerHeight - viewport.height > 150));
    };
    viewport.addEventListener('resize', update);
    document.addEventListener('focusin', update);
    document.addEventListener('focusout', update);
    return () => {
      viewport.removeEventListener('resize', update);
      document.removeEventListener('focusin', update);
      document.removeEventListener('focusout', update);
    };
  }, []);
  useEffect(() => {
    if (navigationType !== 'POP') window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
  }, [pathname, navigationType]);
  return <div className={`app-shell${keyboardOpen ? ' keyboard-open' : ''}`}><header className="app-header"><NavLink to="/" className="brand" aria-label="Dialed overview">DIALED<span> / TRAINING LOG</span></NavLink><NavLink to="/settings" className="account-link" aria-label="Account settings">Settings</NavLink></header><div className="connection-strip" role="status"><span aria-hidden="true" className={online ? 'status-dot' : 'status-dot offline'}/>{online ? pending ? `${pending} workout${pending===1?'':'s'} to sync or review` : 'Ready for your next workout' : 'Offline · workouts save on this device'}</div>
    <main className="main-content">{error && <p className="notice error" role="status">{error}</p>}<Suspense fallback={<p role="status">Opening your training log…</p>}><Routes><Route path="/" element={<Welcome/>}/><Route path="/routines" element={<Routines/>}/><Route path="/start-workout/:id?" element={<StartWorkout/>}/><Route path="/workout/:id?" element={<Workout/>}/><Route path="/workouts" element={<Navigate to="/workout" replace/>}/><Route path="/settings" element={<Settings/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense></main>
    <nav className="bottom-menu" aria-label="Main navigation">{[['/','Overview',<ChartNoAxesColumn key="overview" size={18} strokeWidth={1.8} aria-hidden="true"/>],['/routines','Routines',<ListChecks key="routines" size={18} strokeWidth={1.8} aria-hidden="true"/>],['/workout','History',<History key="history" size={18} strokeWidth={1.8} aria-hidden="true"/>]].map(([to,label,icon]) => <NavLink end={to==='/'} to={to} key={to}>{icon}{label}</NavLink>)}</nav></div>;
}
function Gate() { const { user, loading, recovery } = useAuth(); if (loading) return <main className="auth-shell"><p role="status">Opening your training log…</p></main>; if (!user || recovery) return <AuthScreen/>; return <TrainingProvider key={user.id}><Shell/></TrainingProvider>; }
export default function App() { return <AuthProvider><Gate/></AuthProvider>; }
