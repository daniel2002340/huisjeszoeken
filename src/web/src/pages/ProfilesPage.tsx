import { useEffect, useRef, useState } from 'react';
import { api, formatEuro } from '../api.js';
import type { Profile, ProfileInput } from '../types.js';

const PROPERTY_TYPES = [
  ['apartment', 'appartement'],
  ['studio', 'studio'],
  ['room', 'kamer'],
  ['house', 'huis'],
] as const;

const EMPTY: ProfileInput = {
  name: '',
  emails: [],
  emailsEnabled: true,
  username: null,
  minPrice: null,
  maxPrice: 1500,
  minBedrooms: null,
  minSurfaceM2: null,
  propertyTypes: ['apartment', 'studio'],
  postcodes: [],
  furnishedPref: 'any',
  letterTemplate: `Geachte {makelaar_of_verhuurder},

Met veel interesse zagen wij de woning aan de {adres} in Delft.
{intro_blurb}

{inkomen_zin}
Wij kunnen per direct reageren en zijn flexibel voor een bezichtiging.

Met vriendelijke groet,
{namen}
{telefoon}`,
  letterVars: { namen: '', telefoon: '', intro_blurb: '', inkomen_zin: '' },
  active: true,
};

export function ProfilesPage() {
  const [profiles, setProfiles] = useState<Profile[] | null>(null);
  const [editing, setEditing] = useState<Profile | 'new' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [testingId, setTestingId] = useState<number | null>(null);

  const load = () => {
    api
      .profiles()
      .then((data) => {
        setProfiles(data);
        setError(null);
      })
      .catch((e: Error) => setError(e.message));
  };

  useEffect(load, []);

  const toggleActive = async (p: Profile) => {
    try {
      await api.updateProfile(p.id, { ...p, active: !p.active });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const toggleEmails = async (p: Profile) => {
    try {
      await api.updateProfile(p.id, { ...p, emailsEnabled: !p.emailsEnabled });
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  const sendTestEmail = async (p: Profile) => {
    setNotice(null);
    setError(null);
    setTestingId(p.id);
    try {
      const res = await api.testEmail(p.id);
      setNotice(
        res.dryRun
          ? `Testmail voor "${p.name}" alleen gelogd — DRY_RUN staat aan, er is niets verstuurd.`
          : `Testmail verstuurd naar ${res.sent.join(', ')}.`,
      );
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setTestingId(null);
    }
  };

  const remove = async (p: Profile) => {
    if (!window.confirm(`Profiel "${p.name}" en alle bijbehorende matches verwijderen?`)) return;
    try {
      await api.deleteProfile(p.id);
      load();
    } catch (e) {
      setError((e as Error).message);
    }
  };

  if (error && profiles === null) return <div className="error-banner">{error}</div>;
  if (profiles === null) return <p className="muted">Laden…</p>;

  return (
    <>
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}
      {editing !== null ? (
        <ProfileForm
          initial={editing === 'new' ? EMPTY : editing}
          onDone={(saved) => {
            setEditing(null);
            if (saved) load();
          }}
          save={(input) =>
            editing === 'new' ? api.createProfile(input) : api.updateProfile(editing.id, input)
          }
        />
      ) : (
        <>
          <div style={{ marginBottom: 16 }}>
            <button className="primary" onClick={() => setEditing('new')}>
              + Nieuw profiel
            </button>
          </div>
          {profiles.length === 0 && <p className="muted">Nog geen profielen.</p>}
          {profiles.map((p) => (
            <div className="card" key={p.id}>
              <div className="profile-head">
                <h3>
                  {p.name} <span className={`badge ${p.active ? '' : 'off'}`}>{p.active ? 'actief' : 'uit'}</span>
                  {p.active && !p.emailsEnabled && <span className="badge off">e-mail uit</span>}
                </h3>
                <div style={{ display: 'flex', gap: 8 }}>
                  <button className="ghost" onClick={() => setEditing(p)}>
                    Bewerken
                  </button>
                  <button className="ghost" onClick={() => void toggleActive(p)}>
                    {p.active ? 'Deactiveren' : 'Activeren'}
                  </button>
                  <button className="ghost" onClick={() => void toggleEmails(p)}>
                    {p.emailsEnabled ? 'E-mail uit' : 'E-mail aan'}
                  </button>
                  <button
                    className="ghost"
                    disabled={testingId !== null}
                    onClick={() => void sendTestEmail(p)}
                  >
                    {testingId === p.id ? 'Versturen…' : 'Test e-mail'}
                  </button>
                  <button className="danger" onClick={() => void remove(p)}>
                    Verwijderen
                  </button>
                </div>
              </div>
              <div className="muted">
                {formatEuro(p.minPrice ?? 0)}–{formatEuro(p.maxPrice)} ·{' '}
                {p.propertyTypes.join(', ') || 'alle types'} ·{' '}
                {p.postcodes.join(', ') || 'heel Delft'} · {p.furnishedPref} ·{' '}
                {p.emails.join(', ')}
                {p.username && ` · login: ${p.username}`}
              </div>
            </div>
          ))}
        </>
      )}
    </>
  );
}

function ProfileForm({
  initial,
  save,
  onDone,
}: {
  initial: ProfileInput;
  save: (input: ProfileInput) => Promise<unknown>;
  onDone: (saved: boolean) => void;
}) {
  const [form, setForm] = useState<ProfileInput>({ ...initial, letterVars: { ...initial.letterVars } });
  const [emailsText, setEmailsText] = useState(initial.emails.join(', '));
  const [postcodesText, setPostcodesText] = useState(initial.postcodes.join(' '));
  const [preview, setPreview] = useState('');
  const [sampleNote, setSampleNote] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout>>(undefined);

  const set = <K extends keyof ProfileInput>(key: K, value: ProfileInput[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  // Live preview against the server's sample listing, debounced.
  useEffect(() => {
    clearTimeout(debounce.current);
    debounce.current = setTimeout(() => {
      api
        .letterPreview(form.letterTemplate, form.letterVars)
        .then((res) => {
          setPreview(res.letter);
          setSampleNote(
            `Voorbeeld: ${res.sample.addressRaw}, ${formatEuro(res.sample.priceEur)} — makelaar onbekend`,
          );
        })
        .catch(() => setPreview('(preview niet beschikbaar)'));
    }, 300);
    return () => clearTimeout(debounce.current);
  }, [form.letterTemplate, form.letterVars]);

  const submit = async () => {
    setBusy(true);
    setError(null);
    try {
      const emails = emailsText
        .split(/[,;\s]+/)
        .map((e) => e.trim())
        .filter(Boolean);
      const postcodes = [...new Set(postcodesText.split(/[,;\s]+/).filter(Boolean))];
      // Empty password means "keep the current one" — don't send it at all.
      const { password, ...rest } = form;
      await save({ ...rest, emails, postcodes, ...(password ? { password } : {}) });
      onDone(true);
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  };

  const numField = (
    label: string,
    key: 'minPrice' | 'maxPrice' | 'minBedrooms' | 'minSurfaceM2',
  ) => (
    <label className="field">
      {label}
      <input
        type="number"
        value={form[key] ?? ''}
        onChange={(e) => set(key, e.target.value === '' ? null : Number(e.target.value))}
      />
    </label>
  );

  return (
    <div className="card">
      <h2>{'name' in initial && initial.name ? `Profiel: ${initial.name}` : 'Nieuw profiel'}</h2>
      {error && <div className="error-banner">{error}</div>}
      <div className="form-grid">
        <label className="field">
          Naam
          <input type="text" value={form.name} onChange={(e) => set('name', e.target.value)} />
        </label>
        <label className="field">
          E-mailadressen (komma-gescheiden)
          <input type="text" value={emailsText} onChange={(e) => setEmailsText(e.target.value)} />
        </label>
        <label className="field">
          Gebruikersnaam (dashboard-login, optioneel)
          <input
            type="text"
            autoComplete="off"
            value={form.username ?? ''}
            onChange={(e) => set('username', e.target.value.trim().toLowerCase() || null)}
          />
        </label>
        <label className="field">
          Wachtwoord {initial.username ? '(leeg laten = ongewijzigd)' : '(min. 6 tekens)'}
          <input
            type="password"
            autoComplete="new-password"
            value={form.password ?? ''}
            onChange={(e) => set('password', e.target.value)}
          />
        </label>
        {numField('Min. huur (€)', 'minPrice')}
        {numField('Max. huur (€)', 'maxPrice')}
        {numField('Min. slaapkamers', 'minBedrooms')}
        {numField('Min. oppervlakte (m²)', 'minSurfaceM2')}
        <label className="field">
          Postcodegebieden (leeg = heel Delft)
          <input
            type="text"
            placeholder="bv. 2611 2612 2613 2628"
            value={postcodesText}
            onChange={(e) => setPostcodesText(e.target.value)}
          />
        </label>
        <label className="field">
          Interieur
          <select value={form.furnishedPref} onChange={(e) => set('furnishedPref', e.target.value)}>
            <option value="any">maakt niet uit</option>
            <option value="furnished">gemeubileerd</option>
            <option value="unfurnished">gestoffeerd/kaal</option>
          </select>
        </label>
        <div className="field">
          E-mailalerts
          <div className="checks">
            <label>
              <input
                type="checkbox"
                checked={form.emailsEnabled}
                onChange={(e) => set('emailsEnabled', e.target.checked)}
              />
              e-mail sturen bij nieuwe matches (uit = alleen in het dashboard)
            </label>
          </div>
        </div>
        <div className="field">
          Woningtypes
          <div className="checks">
            {PROPERTY_TYPES.map(([value, label]) => (
              <label key={value}>
                <input
                  type="checkbox"
                  checked={form.propertyTypes.includes(value)}
                  onChange={(e) =>
                    set(
                      'propertyTypes',
                      e.target.checked
                        ? [...form.propertyTypes, value]
                        : form.propertyTypes.filter((t) => t !== value),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>
      </div>

      <h3 style={{ marginTop: 24 }}>Reactiebrief</h3>
      <p className="muted">
        Beschikbare placeholders: {'{adres}'} en {'{makelaar_of_verhuurder}'} komen uit de woning
        zelf; de rest vul je hieronder in.
      </p>
      <div className="editor-split">
        <div>
          <textarea
            rows={14}
            style={{ width: '100%' }}
            value={form.letterTemplate}
            onChange={(e) => set('letterTemplate', e.target.value)}
          />
          <h3 style={{ marginTop: 16 }}>Variabelen</h3>
          {Object.entries(form.letterVars).map(([key, value]) => (
            <div className="vars-row" key={key}>
              <input type="text" value={key} disabled />
              <input
                type="text"
                value={value}
                onChange={(e) => set('letterVars', { ...form.letterVars, [key]: e.target.value })}
              />
              <button
                className="ghost"
                onClick={() => {
                  const { [key]: _removed, ...rest } = form.letterVars;
                  set('letterVars', rest);
                }}
              >
                ×
              </button>
            </div>
          ))}
          <AddVarRow
            onAdd={(key) => {
              if (key && !(key in form.letterVars)) {
                set('letterVars', { ...form.letterVars, [key]: '' });
              }
            }}
          />
        </div>
        <div>
          <div className="muted" style={{ marginBottom: 8 }}>
            {sampleNote || 'Live preview'}
          </div>
          <div className="preview">{preview}</div>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 8, marginTop: 20 }}>
        <button className="primary" disabled={busy} onClick={() => void submit()}>
          Opslaan
        </button>
        <button className="ghost" disabled={busy} onClick={() => onDone(false)}>
          Annuleren
        </button>
      </div>
    </div>
  );
}

function AddVarRow({ onAdd }: { onAdd: (key: string) => void }) {
  const [key, setKey] = useState('');
  return (
    <div className="vars-row">
      <input
        type="text"
        placeholder="nieuwe variabele"
        value={key}
        onChange={(e) => setKey(e.target.value.replace(/[^a-z0-9_]/gi, '_').toLowerCase())}
      />
      <span />
      <button
        className="ghost"
        onClick={() => {
          onAdd(key);
          setKey('');
        }}
      >
        + toevoegen
      </button>
    </div>
  );
}
