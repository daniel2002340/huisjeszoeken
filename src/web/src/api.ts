import type {
  LetterPreviewResponse,
  MatchFeedItem,
  MatchStatus,
  Me,
  Profile,
  ProfileInput,
  StatusResponse,
} from './types.js';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? `${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  me: () => request<Me>('/api/me'),
  login: (username: string, password: string) =>
    request<Me>('/api/login', { method: 'POST', body: JSON.stringify({ username, password }) }),
  logout: () => request<unknown>('/api/logout', { method: 'POST' }),
  profiles: () => request<Profile[]>('/api/profiles'),
  createProfile: (input: ProfileInput) =>
    request<Profile>('/api/profiles', { method: 'POST', body: JSON.stringify(input) }),
  updateProfile: (id: number, input: ProfileInput) =>
    request<Profile>(`/api/profiles/${id}`, { method: 'PUT', body: JSON.stringify(input) }),
  deleteProfile: (id: number) =>
    request<{ deleted: number }>(`/api/profiles/${id}`, { method: 'DELETE' }),
  letterPreview: (letterTemplate: string, letterVars: Record<string, string>) =>
    request<LetterPreviewResponse>('/api/letter-preview', {
      method: 'POST',
      body: JSON.stringify({ letterTemplate, letterVars }),
    }),
  matches: () => request<MatchFeedItem[]>('/api/matches'),
  setMatchStatus: (id: number, status: MatchStatus) =>
    request<unknown>(`/api/matches/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) }),
  status: () => request<StatusResponse>('/api/status'),
};

export function formatEuro(amount: number | null): string {
  return amount === null ? '€ ?' : `€${amount.toLocaleString('nl-NL')}`;
}

export function timeAgo(iso: string | null): string {
  if (!iso) return 'nooit';
  const ms = Date.now() - new Date(iso).getTime();
  const min = Math.round(ms / 60_000);
  if (min < 1) return 'zojuist';
  if (min < 60) return `${min} min geleden`;
  const hours = Math.round(min / 60);
  if (hours < 48) return `${hours} uur geleden`;
  return `${Math.round(hours / 24)} dagen geleden`;
}
