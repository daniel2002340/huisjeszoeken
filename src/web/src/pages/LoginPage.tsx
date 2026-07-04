import { useState } from 'react';
import { api } from '../api.js';
import type { Me } from '../types.js';

export function LoginPage({ onLogin }: { onLogin: (me: Me) => void }) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onLogin(await api.login(username, password));
    } catch {
      setError('Onjuiste gebruikersnaam of wachtwoord.');
      setBusy(false);
    }
  };

  return (
    <div className="card login-card">
      <h2>Inloggen</h2>
      <p className="muted">Log in met de gebruikersnaam en het wachtwoord van je profiel.</p>
      {error && <div className="error-banner">{error}</div>}
      <form onSubmit={(e) => void submit(e)}>
        <label className="field">
          Gebruikersnaam
          <input
            type="text"
            autoFocus
            autoComplete="username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label className="field">
          Wachtwoord
          <input
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <button className="primary" type="submit" disabled={busy || !username || !password}>
          Inloggen
        </button>
      </form>
    </div>
  );
}
