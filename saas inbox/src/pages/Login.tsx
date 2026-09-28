import { useState } from 'react';
import { apiService } from '../context/MessagingContext';

const DEMO_EMAIL = 'demo@unification.app';
const DEMO_PASSWORD = 'demo12345';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (loginEmail: string, loginPassword: string) => {
    if (!apiService) return;
    setError('');
    setLoading(true);
    try {
      await apiService.login(loginEmail, loginPassword);
      window.location.href = '/inbox'; // full reload so the inbox loads with the new token
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--color-brand-surface)] p-4">
      <form
        onSubmit={e => { e.preventDefault(); submit(email, password); }}
        className="w-full max-w-sm bg-white border border-[var(--color-brand-border)] rounded-2xl p-6 shadow-sm space-y-4"
      >
        <div>
          <h1 className="text-xl font-semibold text-[var(--color-brand-text)]">Sign in</h1>
          <p className="text-sm text-[var(--color-brand-text-secondary)]">Unified inbox for your business</p>
        </div>

        <label className="block text-sm font-medium text-[var(--color-brand-text)]">
          Email
          <input
            type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)}
            className="mt-1 w-full border border-[var(--color-brand-border)] rounded-lg px-3 py-2 text-sm"
          />
        </label>
        <label className="block text-sm font-medium text-[var(--color-brand-text)]">
          Password
          <input
            type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)}
            className="mt-1 w-full border border-[var(--color-brand-border)] rounded-lg px-3 py-2 text-sm"
          />
        </label>

        {error && <p role="alert" className="text-sm text-red-600">{error}</p>}

        <button type="submit" disabled={loading} className="w-full bg-gray-900 hover:bg-black text-white rounded-lg py-2 text-sm font-medium transition-colors disabled:opacity-60">
          {loading ? 'Signing in…' : 'Sign in'}
        </button>
        <button
          type="button" disabled={loading} onClick={() => submit(DEMO_EMAIL, DEMO_PASSWORD)}
          className="w-full border border-[var(--color-brand-border)] rounded-lg py-2 text-sm font-medium text-[var(--color-brand-text)] hover:bg-gray-50"
        >
          Try the demo workspace
        </button>
      </form>
    </div>
  );
}
