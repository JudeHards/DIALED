import { lazy, Suspense } from 'react';
import { NavLink, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, AuthScreen, useAuth } from './lib/Auth';
import { TrainingProvider, useTraining } from './lib/Training';
const Welcome = lazy(() => import('./pages/Welcome'));
const Routines = lazy(() => import('./pages/Routines'));
const Workout = lazy(() => import('./pages/Workout'));
const StartWorkout = lazy(() => import('./pages/StartWorkout'));
const Settings = lazy(() => import('./pages/Settings'));
function Shell() {
  const { online, error, rows } = useTraining(); const pending = rows.filter(r => r.state !== 'synced').length;
  return <div className="app-shell"><header className="app-header"><NavLink to="/" className="brand">DIALED<span> / TRAINING LOG</span></NavLink><NavLink to="/settings" className="account-link" aria-label="Account settings">Account ↗</NavLink></header><div className="connection-strip"><span className={online ? 'status-dot' : 'status-dot offline'}/>{online ? pending ? `${pending} on-device session${pending===1?'':'s'} to sync` : 'Ready for your next session' : 'Offline · logging stays on this device'}</div>
    <main className="main-content">{error && <p className="notice error" role="status">{error}</p>}<Suspense fallback={<p role="status">Opening your training log…</p>}><Routes><Route path="/" element={<Welcome/>}/><Route path="/routines" element={<Routines/>}/><Route path="/start-workout/:id?" element={<StartWorkout/>}/><Route path="/workout/:id?" element={<Workout/>}/><Route path="/workouts" element={<Navigate to="/workout" replace/>}/><Route path="/settings" element={<Settings/>}/><Route path="*" element={<Navigate to="/" replace/>}/></Routes></Suspense></main>
    <nav className="bottom-menu" aria-label="Main navigation">{[['/','Overview','◉'],['/routines','Routines','▤'],['/workout','History','↗']].map(([to,label,icon]) => <NavLink end={to==='/'} to={to} key={to}><span aria-hidden="true">{icon}</span>{label}</NavLink>)}</nav></div>;
}
function Gate() { const { user, loading, recovery } = useAuth(); if (loading) return <main className="auth-shell"><p>Opening your training log…</p></main>; if (!user || recovery) return <AuthScreen/>; return <TrainingProvider key={user.id}><Shell/></TrainingProvider>; }
export default function App() { return <AuthProvider><Gate/></AuthProvider>; }
