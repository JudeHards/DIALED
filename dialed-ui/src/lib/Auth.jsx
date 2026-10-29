import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);
  const [authError, setAuthError] = useState('');
  useEffect(() => {
    if (!supabase) return;
    let active = true; let authChanged = false;
    supabase.auth.getSession().then(({ data, error }) => {
      if (!active || authChanged) return;
      setSession(data?.session ?? null); setLoading(false);
      if (error) setAuthError(error.message);
    }).catch(error => { if (active && !authChanged) { setAuthError(error.message); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      if (!active) return;
      authChanged = true; setAuthError(''); setSession(next); setLoading(false); if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={{ session, user: session?.user, loading, recovery, setRecovery, authError }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
export function AuthScreen() {
  const { recovery, setRecovery, authError } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!supabase) return <main className="auth-shell"><div className="brand">DIALED<span> / TRAINING LOG</span></div><h1>Your training log is almost ready.</h1><p>Dialed’s account connection hasn’t been set up yet. Follow the setup steps in README.md to connect it.</p></main>;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage(''); setFailed(false);
    try {
      let result;
      if (recovery) result = await supabase.auth.updateUser({ password });
      else if (mode === 'signup') result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      else if (mode === 'reset') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (recovery) { setRecovery(false); setMessage('Password updated.'); }
      else if (mode !== 'login') setMessage(mode === 'signup' ? 'Check your email to verify your account, then sign in.' : 'Check your email for a password reset link.');
    } catch (error) { setMessage(error.message); setFailed(true); } finally { setBusy(false); }
  }
  return <main className="auth-shell"><div className="brand">DIALED<span> / TRAINING LOG</span></div><div className="eyebrow">YOUR TRAINING LOG</div><h1>Keep showing up.<br/><em>See your progress.</em></h1><p>Plan your workouts, log your sets, and build on your last workout.</p>
    <form onSubmit={submit} className="panel stack"><h2>{recovery ? 'Choose a new password' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h2>
      {mode === 'reset' && !recovery && <p className="muted small-text">Enter your account email and we’ll send you a reset link.</p>}
      {!recovery && <label>Email<input type="email" name="email" autoComplete="email" autoCapitalize="none" autoCorrect="off" spellCheck={false} inputMode="email" enterKeyHint={mode === 'reset' ? 'go' : 'next'} required disabled={busy} value={email} onChange={e => setEmail(e.target.value)}/></label>}
      {(recovery || mode !== 'reset') && <label>{recovery ? 'New password' : 'Password'}<input type="password" name="password" minLength={8} autoComplete={!recovery && mode === 'login' ? 'current-password' : 'new-password'} enterKeyHint="go" required disabled={busy} aria-describedby={recovery || mode === 'signup' ? 'password-help' : undefined} value={password} onChange={e => setPassword(e.target.value)}/></label>}
      {(recovery || mode === 'signup') && <p id="password-help" className="muted small-text">Use at least 8 characters.</p>}
      {(message || authError) && <p className={`notice${failed || authError ? ' error' : ''}`} role={failed || authError ? 'alert' : 'status'}>{message || authError}</p>}
      <button className="button primary" disabled={busy}>{busy ? recovery ? 'Updating password…' : mode === 'signup' ? 'Creating account…' : mode === 'reset' ? 'Sending link…' : 'Signing in…' : recovery ? 'Update password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      {!recovery && <div className="row wrap">{['login','signup','reset'].filter(m => m !== mode).map(m => <button className="text-button" type="button" key={m} disabled={busy} onClick={() => { setMode(m); setMessage(''); setFailed(false); setPassword(''); }}>{m === 'login' ? 'Back to sign in' : m === 'signup' ? 'Create account' : 'Forgot password?'}</button>)}</div>}
    </form></main>;
}
