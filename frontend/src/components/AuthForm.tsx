import React, { useState } from 'react';
import { useAuth } from '../hooks/useAuth';
import { motion } from 'framer-motion';

export default function AuthForm({ onLoggedIn }: { onLoggedIn?: () => void }) {
  const { login, signup, token, logout } = useAuth();
  const [mode, setMode] = useState<'login' | 'signup'>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  async function handleAuth() {
    setMsg(null);
    if (!email || !password) return setMsg('Please add email and password');
    setBusy(true);
    try {
      if (mode === 'signup') {
        await signup(email, password);
        setMsg('Signup successful — please login');
        setMode('login');
      } else {
        await login(email, password);
        setMsg('Logged in!');
        // redirect to studio area: call parent handler or navigate to hash
        if (onLoggedIn) onLoggedIn();
        else {
          // small timeout to let UI update then focus studio
          window.location.hash = '#studio';
          setTimeout(() => {
            const el = document.getElementById('studio');
            el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
            (el?.querySelector('input, textarea, button') as HTMLElement | null)?.focus();
          }, 150);
        }
      }
    } catch (err: any) {
      setMsg(err?.response?.data?.message || err?.message || 'Auth failed');
    } finally {
      setBusy(false);
    }
  }

  if (token) {
    return (
      <motion.div
        className="card mb-4 flex items-center justify-between"
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <div>
          <div className="font-semibold">You're signed in</div>
          <div className="text-sm text-[var(--muted)]">Continue to the image studio to create.</div>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => {
              // on logged in redirect
              if (onLoggedIn) onLoggedIn();
              else {
                window.location.hash = '#studio';
                setTimeout(() => {
                  const el = document.getElementById('studio');
                  el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
                }, 100);
              }
            }}
            className="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1 rounded"
          >
            Go to Studio
          </button>
          <button onClick={logout} className="border px-3 py-1 rounded">
            Logout
          </button>
        </div>
      </motion.div>
    );
  }

  return (
    <motion.div
      className="card mb-4"
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
    >
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-lg font-bold">{mode === 'login' ? 'Welcome back' : 'Create account'}</h3>
        <div className="text-sm text-[var(--muted)]">{mode === 'login' ? 'Sign in to generate' : 'Join to save creations'}</div>
      </div>

      <div className="flex flex-col gap-2">
        <input
          aria-label="email"
          className="border rounded px-3 py-2 bg-transparent"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <input
          aria-label="password"
          className="border rounded px-3 py-2 bg-transparent"
          placeholder="Password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {msg && <div className="text-sm text-red-400">{msg}</div>}

        <div className="flex gap-2 mt-2">
          <button
            onClick={handleAuth}
            disabled={busy}
            className="bg-indigo-600 text-white px-4 py-2 rounded disabled:opacity-60"
          >
            {busy ? 'Working…' : mode === 'login' ? 'Login' : 'Signup'}
          </button>

          <button
            onClick={() => setMode(mode === 'login' ? 'signup' : 'login')}
            className="border px-3 py-2 rounded"
          >
            {mode === 'login' ? 'Create account' : 'Have an account?'}
          </button>
        </div>
      </div>
    </motion.div>
  );
}
