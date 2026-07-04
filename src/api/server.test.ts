import type { FastifyInstance } from 'fastify';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { Listing } from '../core/types.js';
import { runMigrations } from '../db/migrate.js';
import { insertListing, insertMatch } from '../db/repo.js';
import { buildServer } from './server.js';

// Tests that hit DB-backed routes need the schema to exist. Vitest points
// DB_PATH at a throwaway database (vitest.config.ts) wiped per run.
runMigrations();

const ADMIN_PASSWORD = 'geheim';

const testListing = (externalId: string): Listing => ({
  source: 'test',
  externalId,
  url: `https://example.com/${externalId}`,
  addressRaw: 'Voorstraat 12, 2611 JK Delft',
  street: 'Voorstraat',
  houseNo: '12',
  postcode: '2611JK',
  city: 'Delft',
  priceEur: 1450,
  surfaceM2: 62,
  bedrooms: 2,
  propertyType: 'apartment',
  furnished: 'unfurnished',
  agency: null,
  imageUrl: null,
  dedupeKey: `voorstraat12-${externalId}`,
});

const profileInput = (name: string, extra: Record<string, unknown> = {}) => ({
  name,
  emails: [`${name.toLowerCase().replace(/\W/g, '')}@example.com`],
  letterTemplate: 'Geachte {makelaar_of_verhuurder}, wij zagen {adres}. Groet, {namen}',
  letterVars: { namen: name },
  ...extra,
});

/** Log in and return the session cookie value. */
async function login(app: FastifyInstance, username: string, password: string): Promise<string> {
  const res = await app.inject({ method: 'POST', url: '/api/login', payload: { username, password } });
  expect(res.statusCode).toBe(200);
  const cookie = res.cookies.find((c) => c.name === 'session');
  expect(cookie).toBeDefined();
  return (cookie as { value: string }).value;
}

describe('api server', () => {
  let app: FastifyInstance;
  let adminCookie: { session: string };

  beforeAll(async () => {
    app = buildServer({ dashboardPassword: ADMIN_PASSWORD });
    await app.ready();
    adminCookie = { session: await login(app, 'admin', ADMIN_PASSWORD) };
  });

  afterAll(async () => {
    await app.close();
  });

  describe('login', () => {
    it('requires a session for API routes', async () => {
      expect((await app.inject({ method: 'GET', url: '/api/profiles' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/api/matches' })).statusCode).toBe(401);
      expect((await app.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    });

    it('rejects wrong credentials and unknown users', async () => {
      const wrong = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'admin', password: 'fout' },
      });
      expect(wrong.statusCode).toBe(401);
      const unknown = await app.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'niemand', password: 'x' },
      });
      expect(unknown.statusCode).toBe(401);
    });

    it('disables admin login when no password is configured', async () => {
      const bare = buildServer({ dashboardPassword: undefined });
      const res = await bare.inject({
        method: 'POST',
        url: '/api/login',
        payload: { username: 'admin', password: '' },
      });
      expect(res.statusCode).not.toBe(200);
      await bare.close();
    });

    it('admin can log in, use the API, and log out', async () => {
      const session = await login(app, 'admin', ADMIN_PASSWORD);
      const me = await app.inject({ method: 'GET', url: '/api/me', cookies: { session } });
      expect(me.json()).toEqual({ profileId: null, name: 'admin', admin: true });

      const out = await app.inject({ method: 'POST', url: '/api/logout', cookies: { session } });
      expect(out.statusCode).toBe(200);
      const after = await app.inject({ method: 'GET', url: '/api/me', cookies: { session } });
      expect(after.statusCode).toBe(401); // session revoked server-side
    });
  });

  describe('profiles with login credentials', () => {
    it('creates a profile with username/password and never exposes the hash', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('Anna & Tom', { username: 'Anna', password: 'hunter22' }),
      });
      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.username).toBe('anna'); // normalized to lowercase
      expect(body).not.toHaveProperty('passwordHash');
      expect(JSON.stringify(res.json())).not.toContain('scrypt');

      const list = await app.inject({ method: 'GET', url: '/api/profiles', cookies: adminCookie });
      expect(JSON.stringify(list.json())).not.toContain('scrypt');
    });

    it('rejects a username without password, duplicates, and "admin"', async () => {
      const noPass = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('X', { username: 'xenia' }),
      });
      expect(noPass.statusCode).toBe(400);

      const dup = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('Y', { username: 'anna', password: 'hunter22' }),
      });
      expect(dup.statusCode).toBe(409);

      const reserved = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('Z', { username: 'admin', password: 'hunter22' }),
      });
      expect(reserved.statusCode).toBe(400);
    });
  });

  describe('friend sessions', () => {
    let friendId: number;
    let otherId: number;
    let friendSession: string;
    let friendMatchId: number;
    let otherMatchId: number;

    beforeAll(async () => {
      const friend = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('Bram', { username: 'bram', password: 'wachtwoord' }),
      });
      friendId = friend.json().id;
      const other = await app.inject({
        method: 'POST',
        url: '/api/profiles',
        cookies: adminCookie,
        payload: profileInput('Carla', { username: 'carla', password: 'wachtwoord' }),
      });
      otherId = other.json().id;

      const l1 = insertListing(testListing('friend-house'));
      const l2 = insertListing(testListing('other-house'));
      friendMatchId = insertMatch(l1!.id, friendId)!.id;
      otherMatchId = insertMatch(l2!.id, otherId)!.id;

      friendSession = await login(app, 'bram', 'wachtwoord');
    });

    it('sees only their own matches', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/matches',
        cookies: { session: friendSession },
      });
      expect(res.statusCode).toBe(200);
      const items = res.json() as Array<{ profileId: number }>;
      expect(items.length).toBeGreaterThan(0);
      expect(items.every((m) => m.profileId === friendId)).toBe(true);

      // Admin still sees everything.
      const all = await app.inject({ method: 'GET', url: '/api/matches', cookies: adminCookie });
      const profileIds = (all.json() as Array<{ profileId: number }>).map((m) => m.profileId);
      expect(profileIds).toContain(friendId);
      expect(profileIds).toContain(otherId);
    });

    it('can update own match status but not someone else’s', async () => {
      const own = await app.inject({
        method: 'PATCH',
        url: `/api/matches/${friendMatchId}`,
        cookies: { session: friendSession },
        payload: { status: 'responded' },
      });
      expect(own.statusCode).toBe(200);
      expect(own.json().status).toBe('responded');

      const foreign = await app.inject({
        method: 'PATCH',
        url: `/api/matches/${otherMatchId}`,
        cookies: { session: friendSession },
        payload: { status: 'rejected' },
      });
      expect(foreign.statusCode).toBe(404);
    });

    it('is blocked from admin-only routes', async () => {
      for (const [method, url] of [
        ['GET', '/api/profiles'],
        ['GET', '/api/status'],
        ['POST', '/api/letter-preview'],
        ['DELETE', `/api/profiles/${otherId}`],
      ] as const) {
        const res = await app.inject({
          method,
          url,
          cookies: { session: friendSession },
          ...(method === 'POST' ? { payload: { letterTemplate: 'x', letterVars: {} } } : {}),
        });
        expect(res.statusCode, `${method} ${url}`).toBe(403);
      }
    });

    it('loses access when the admin removes their login', async () => {
      const profile = (await app.inject({ method: 'GET', url: '/api/profiles', cookies: adminCookie }))
        .json()
        .find((p: { id: number }) => p.id === friendId);
      const res = await app.inject({
        method: 'PUT',
        url: `/api/profiles/${friendId}`,
        cookies: adminCookie,
        payload: { ...profile, username: null },
      });
      expect(res.statusCode).toBe(200);
      const after = await app.inject({
        method: 'GET',
        url: '/api/me',
        cookies: { session: friendSession },
      });
      expect(after.statusCode).toBe(401);
    });
  });

  describe('letter preview', () => {
    it('renders a letter preview against the sample listing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/letter-preview',
        cookies: adminCookie,
        payload: {
          letterTemplate: 'Geachte {makelaar_of_verhuurder}, wij zagen {adres}. Groet, {namen}',
          letterVars: { namen: 'Anna & Tom' },
        },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.letter).toBe('Geachte heer/mevrouw, wij zagen Voorstraat 12. Groet, Anna & Tom');
      expect(body.sample.addressRaw).toBe('Voorstraat 12, 2611 JK Delft');
    });

    it('rejects invalid bodies with 400', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/letter-preview',
        cookies: adminCookie,
        payload: { letterTemplate: 42 },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().error).toBe('validation failed');
    });
  });
});
