import { useEffect, useState } from 'react';
import { api } from './api.js';
import { HealthPage } from './pages/HealthPage.js';
import { LoginPage } from './pages/LoginPage.js';
import { MatchesPage } from './pages/MatchesPage.js';
import { ProfilesPage } from './pages/ProfilesPage.js';
import type { Me } from './types.js';

const TABS = [
  { id: 'matches', label: 'Matches' },
  { id: 'profiles', label: 'Profielen' },
  { id: 'health', label: 'Health' },
] as const;

type TabId = (typeof TABS)[number]['id'];

const readTab = (): TabId => {
  const hash = window.location.hash.replace('#/', '');
  return TABS.some((t) => t.id === hash) ? (hash as TabId) : 'matches';
};

export function App() {
  const [tab, setTab] = useState<TabId>(readTab);
  // undefined = still checking the session, null = logged out.
  const [me, setMe] = useState<Me | null | undefined>(undefined);

  useEffect(() => {
    api
      .me()
      .then(setMe)
      .catch(() => setMe(null));
  }, []);

  useEffect(() => {
    const onHash = () => setTab(readTab());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const logout = async () => {
    try {
      await api.logout();
    } finally {
      setMe(null);
    }
  };

  if (me === undefined) {
    return (
      <div className="shell">
        <p className="muted">Laden…</p>
      </div>
    );
  }

  if (me === null) {
    return (
      <div className="shell">
        <header className="topbar">
          <h1>
            <span className="mark" aria-hidden="true">◆</span>
            huisjeszoeken <span className="sub">Delft Rental Alert</span>
          </h1>
        </header>
        <LoginPage onLogin={setMe} />
      </div>
    );
  }

  // Friends only get the matches feed; profiles CRUD + health are admin-only.
  const tabs = me.admin ? TABS : TABS.filter((t) => t.id === 'matches');
  const activeTab = tabs.some((t) => t.id === tab) ? tab : 'matches';

  return (
    <div className="shell">
      <header className="topbar">
        <h1>
          <span className="mark" aria-hidden="true">◆</span>
          huisjeszoeken <span className="sub">Delft Rental Alert</span>
        </h1>
        <nav className="tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              className={t.id === activeTab ? 'active' : ''}
              onClick={() => {
                window.location.hash = `#/${t.id}`;
              }}
            >
              {t.label}
            </button>
          ))}
        </nav>
        <div className="whoami">
          <span className="muted">{me.name}</span>
          <button className="ghost" onClick={() => void logout()}>
            Uitloggen
          </button>
        </div>
      </header>
      {activeTab === 'matches' && <MatchesPage />}
      {activeTab === 'profiles' && me.admin && <ProfilesPage />}
      {activeTab === 'health' && me.admin && <HealthPage />}
    </div>
  );
}
