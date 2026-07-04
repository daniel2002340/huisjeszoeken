import { useEffect, useState } from 'react';
import { api, timeAgo } from '../api.js';
import { Sparkline } from '../components/Sparkline.js';
import type { StatusResponse } from '../types.js';

export function HealthPage() {
  const [status, setStatus] = useState<StatusResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .status()
      .then((data) => {
        setStatus(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  if (error) return <div className="error-banner">{error}</div>;
  if (status === null) return <p className="muted">Laden…</p>;
  if (status.sources.length === 0)
    return <p className="muted">Nog geen scrape-runs geregistreerd.</p>;

  return (
    <div className="health-grid">
      {status.sources.map((s) => (
        <div className="card" key={s.source}>
          <div className="profile-head">
            <h3>{s.source}</h3>
            <span className={`badge ${s.healthy ? '' : 'red'}`}>
              {s.healthy ? 'gezond' : 'probleem'}
            </span>
          </div>
          <div className="health-row">
            <span className="muted">laatste succesvolle run</span>
            <span>{timeAgo(s.lastSuccessAt)}</span>
          </div>
          <div className="health-row">
            <span className="muted">laatste poging</span>
            <span>{timeAgo(s.lastRunAt)}</span>
          </div>
          <div className="health-row">
            <span className="muted">woningen bij laatste run</span>
            <span>{s.lastListingsFound ?? '—'}</span>
          </div>
          <div className="muted" style={{ marginTop: 10 }}>
            nieuwe woningen per dag (14 dagen)
          </div>
          <Sparkline points={s.newPerDay.map((d) => d.count)} />
          {s.recentErrors.length > 0 && (
            <ul className="errors">
              {s.recentErrors.map((e, i) => (
                <li key={i}>
                  {timeAgo(e.at)}: {e.error ?? 'onbekende fout'}
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </div>
  );
}
