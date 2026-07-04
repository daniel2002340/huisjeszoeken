import { useEffect, useState } from 'react';
import { api, formatEuro, timeAgo } from '../api.js';
import { MATCH_STATUSES, type MatchFeedItem, type MatchStatus } from '../types.js';

const STATUS_LABELS: Record<MatchStatus, string> = {
  new: 'nieuw',
  responded: 'gereageerd',
  viewing: 'bezichtiging',
  rejected: 'afgewezen',
  won: 'gewonnen 🎉',
};

export function MatchesPage() {
  const [items, setItems] = useState<MatchFeedItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = () => {
    api
      .matches()
      .then((data) => {
        setItems(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(() => {
    load();
    const timer = setInterval(load, 30_000);
    return () => clearInterval(timer);
  }, []);

  const setStatus = async (id: number, status: MatchStatus) => {
    try {
      await api.setMatchStatus(id, status);
      setItems((prev) => prev?.map((m) => (m.id === id ? { ...m, status } : m)) ?? null);
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error) return <div className="error-banner">{error}</div>;
  if (items === null) return <p className="muted">Laden…</p>;
  if (items.length === 0) return <p className="muted">Nog geen matches — zodra een nieuwe woning bij een profiel past verschijnt hij hier.</p>;

  return (
    <>
      {items.map((m) => {
        const details = [
          m.listing.surfaceM2 !== null ? `${m.listing.surfaceM2} m²` : null,
          m.listing.bedrooms !== null ? `${m.listing.bedrooms} slk` : null,
          m.listing.agency,
        ]
          .filter(Boolean)
          .join(' · ');
        return (
          <div className="card match" key={m.id}>
            {m.listing.imageUrl ? (
              <img src={m.listing.imageUrl} alt="" loading="lazy" />
            ) : (
              <img alt="" />
            )}
            <div className="body">
              <div className="match-top">
                <a className="match-addr" href={m.listing.url} target="_blank" rel="noreferrer">
                  {m.listing.addressRaw}
                </a>
                <span className="match-price">{formatEuro(m.listing.priceEur)}</span>
              </div>
              <div className="muted">
                {details && `${details} · `}
                via {m.listing.source} · voor <strong>{m.profileName}</strong> ·{' '}
                {timeAgo(m.listing.firstSeenAt)}
                {m.emailedAt === null && ' · ✉️ nog niet gemaild'}
              </div>
              <div className="statuses">
                {MATCH_STATUSES.map((status) => (
                  <button
                    key={status}
                    className={m.status === status ? 'current' : ''}
                    onClick={() => void setStatus(m.id, status)}
                  >
                    {STATUS_LABELS[status]}
                  </button>
                ))}
              </div>
            </div>
          </div>
        );
      })}
    </>
  );
}
