import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from './supabase';
const AuthContext = createContext(null);
export function AuthProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [recovery, setRecovery] = useState(false);
  useEffect(() => {
    if (!supabase) return;
    let active = true;
    supabase.auth.getSession().then(({ data }) => { if (active) { setSession(data.session); setLoading(false); } });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, next) => {
      setSession(next); setLoading(false); if (event === 'PASSWORD_RECOVERY') setRecovery(true);
      if (event === 'SIGNED_OUT') setRecovery(false);
    });
    return () => { active = false; subscription.unsubscribe(); };
  }, []);
  return <AuthContext.Provider value={{ session, user: session?.user, loading, recovery, setRecovery }}>{children}</AuthContext.Provider>;
}
export function useAuth() { return useContext(AuthContext); }
export function AuthScreen() {
  const { recovery, setRecovery } = useAuth();
  const [mode, setMode] = useState('login');
  const [email, setEmail] = useState(''); const [password, setPassword] = useState('');
  const [message, setMessage] = useState(''); const [busy, setBusy] = useState(false);
  if (!supabase) return <main className="auth-shell"><div className="brand">DIALED<span> / TRAINING LOG</span></div><h1>Your next session starts here.</h1><p>This installation needs its Supabase connection configured. Follow the setup steps in README.md, then restart the app.</p></main>;
  async function submit(event) {
    event.preventDefault(); setBusy(true); setMessage('');
    try {
      let result;
      if (recovery) result = await supabase.auth.updateUser({ password });
      else if (mode === 'signup') result = await supabase.auth.signUp({ email, password, options: { emailRedirectTo: window.location.origin } });
      else if (mode === 'reset') result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${window.location.origin}/reset-password` });
      else result = await supabase.auth.signInWithPassword({ email, password });
      if (result.error) throw result.error;
      if (recovery) { setRecovery(false); setMessage('Password updated.'); }
      else if (mode !== 'login') setMessage(mode === 'signup' ? 'Check your email to verify your account, then sign in.' : 'Check your email for a password reset link.');
    } catch (error) { setMessage(error.message); } finally { setBusy(false); }
  }
  return <main className="auth-shell"><div className="brand">DIALED<span> / TRAINING LOG</span></div><div className="eyebrow">SHOW UP. BUILD ON IT.</div><h1>Your next session.<br/><em>A little stronger.</em></h1><p>Log the work. See what you trained. Find your next starting weight.</p>
    <form onSubmit={submit} className="panel stack"><h2>{recovery ? 'Choose a new password' : mode === 'signup' ? 'Create your account' : mode === 'reset' ? 'Reset your password' : 'Welcome back'}</h2>
      {!recovery && <label>Email<input type="email" autoComplete="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>}
      {(recovery || mode !== 'reset') && <label>Password<input type="password" minLength={8} autoComplete={mode === 'login' ? 'current-password' : 'new-password'} required value={password} onChange={e => setPassword(e.target.value)}/></label>}
      {message && <p className="notice" role="status">{message}</p>}
      <button className="button primary" disabled={busy}>{busy ? 'Please wait…' : recovery ? 'Update password' : mode === 'signup' ? 'Create account' : mode === 'reset' ? 'Send reset link' : 'Sign in'}</button>
      {!recovery && <div className="row wrap">{['login','signup','reset'].filter(m => m !== mode).map(m => <button className="text-button" type="button" key={m} onClick={() => { setMode(m); setMessage(''); }}>{m === 'login' ? 'Sign in' : m === 'signup' ? 'Create account' : 'Forgot password?'}</button>)}</div>}
    </form></main>;
}
