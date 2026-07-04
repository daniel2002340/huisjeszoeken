import type { FastifyPluginAsync } from 'fastify';
import { ZodError } from 'zod';
import { renderApplicationLetter } from '../core/letter.js';
import { matchesProfile } from '../core/matcher.js';
import {
  createProfile,
  createSession,
  deleteExpiredSessions,
  deleteProfile,
  deleteSession,
  deleteSessionsForProfile,
  getKnownSources,
  getLastRuns,
  getLastSuccessfulRun,
  getMatch,
  getMatchesFeed,
  getNewListingsPerDay,
  getProfile,
  getProfileByUsername,
  getProfiles,
  getRecentListings,
  getSessionAuth,
  insertMatch,
  type ProfileRow,
  updateMatchStatus,
  updateProfile,
} from '../db/repo.js';
import {
  hashPassword,
  newSessionToken,
  safeEqual,
  SESSION_COOKIE,
  SESSION_TTL_DAYS,
  type SessionAuth,
  verifyPassword,
} from './auth.js';
import { idParamSchema, letterPreviewSchema, loginSchema, matchStatusSchema, profileInputSchema } from './schemas.js';
import { SAMPLE_LISTING } from './sample-listing.js';

declare module 'fastify' {
  interface FastifyRequest {
    auth?: SessionAuth;
  }
}

export interface ApiRoutesOptions {
  /** Password for the built-in `admin` login; undefined disables admin login. */
  adminPassword?: string | undefined;
}

/** Password hash never leaves the API. */
const toPublicProfile = ({ passwordHash: _hash, ...profile }: ProfileRow) => profile;

/** How far back a new/edited profile is backfilled with existing listings. */
const BACKFILL_DAYS = 7;

/**
 * Feed-only backfill: match recent listings for a created/updated profile so
 * its dashboard doesn't start empty. No emails — emailed_at stays NULL and the
 * scheduler never revisits stored listings, so these can't trigger alerts.
 * Idempotent via UNIQUE(listing_id, profile_id); inactive profiles match nothing.
 */
function backfillMatches(profile: ProfileRow): void {
  for (const listing of getRecentListings(BACKFILL_DAYS)) {
    if (matchesProfile(listing, profile)) insertMatch(listing.id, profile.id);
  }
}

/** What a logged-in friend (non-admin) may call: own identity + own matches. */
const FRIEND_ROUTES = new Set([
  'GET /api/me',
  'POST /api/logout',
  'GET /api/matches',
  'PATCH /api/matches/:id',
]);

/** Dashboard API (PLAN.md §6): login, profiles CRUD, matches feed, health. */
export const apiRoutes: FastifyPluginAsync<ApiRoutesOptions> = async (app, opts) => {
  app.setErrorHandler((error, _req, reply) => {
    if (error instanceof ZodError) {
      return reply.code(400).send({ error: 'validation failed', issues: error.issues });
    }
    app.log.error(error);
    return reply.code(500).send({ error: 'internal error' });
  });

  // --- Session gate (every /api route except the login call itself) --------
  app.addHook('onRequest', async (req, reply) => {
    const route = `${req.method} ${req.routeOptions.url ?? req.url}`;
    if (route === 'POST /api/login') return;
    const token = req.cookies[SESSION_COOKIE];
    const auth = token ? getSessionAuth(token) : undefined;
    if (!auth) return reply.code(401).send({ error: 'unauthorized' });
    req.auth = auth;
    if (!auth.admin && !FRIEND_ROUTES.has(route)) {
      return reply.code(403).send({ error: 'forbidden' });
    }
  });

  // --- Login / logout -------------------------------------------------------
  app.post('/login', async (req, reply) => {
    const { username, password } = loginSchema.parse(req.body);
    let auth: Omit<SessionAuth, 'token'> | undefined;
    if (username === 'admin') {
      if (opts.adminPassword && safeEqual(password, opts.adminPassword)) {
        auth = { profileId: null, name: 'admin', admin: true };
      }
    } else {
      const profile = getProfileByUsername(username);
      if (profile?.passwordHash && verifyPassword(password, profile.passwordHash)) {
        auth = { profileId: profile.id, name: profile.name, admin: false };
      }
    }
    if (!auth) return reply.code(401).send({ error: 'invalid username or password' });

    deleteExpiredSessions();
    const token = newSessionToken();
    const ttlSec = SESSION_TTL_DAYS * 86_400;
    createSession(token, auth.profileId, new Date(Date.now() + ttlSec * 1000));
    return reply
      .setCookie(SESSION_COOKIE, token, {
        path: '/',
        httpOnly: true,
        sameSite: 'lax',
        maxAge: ttlSec,
      })
      .send(auth);
  });

  app.post('/logout', async (req, reply) => {
    if (req.auth) deleteSession(req.auth.token);
    return reply.clearCookie(SESSION_COOKIE, { path: '/' }).send({ loggedOut: true });
  });

  app.get('/me', async (req) => {
    const { profileId, name, admin } = req.auth as SessionAuth;
    return { profileId, name, admin };
  });

  // --- Profiles CRUD (admin only, enforced by the session gate) ------------
  app.get('/profiles', async () => getProfiles().map(toPublicProfile));

  app.post('/profiles', async (req, reply) => {
    const { password, ...input } = profileInputSchema.parse(req.body);
    if (input.username && !password) {
      return reply.code(400).send({ error: 'password is required when setting a username' });
    }
    if (input.username && getProfileByUsername(input.username)) {
      return reply.code(409).send({ error: 'username already in use' });
    }
    const created = createProfile({ ...input, passwordHash: password ? hashPassword(password) : null });
    backfillMatches(created);
    return reply.code(201).send(toPublicProfile(created));
  });

  app.put('/profiles/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    const { password, ...input } = profileInputSchema.parse(req.body);
    const existing = getProfile(id);
    if (!existing) return reply.code(404).send({ error: 'profile not found' });
    if (input.username) {
      const clash = getProfileByUsername(input.username);
      if (clash && clash.id !== id) return reply.code(409).send({ error: 'username already in use' });
    }
    // Password is write-only: empty means keep; username removal revokes login.
    const passwordHash =
      input.username === null ? null : password ? hashPassword(password) : existing.passwordHash;
    if (input.username === null || password) deleteSessionsForProfile(id);
    const updated = updateProfile(id, { ...input, passwordHash });
    if (!updated) return reply.code(404).send({ error: 'profile not found' });
    backfillMatches(updated);
    return toPublicProfile(updated);
  });

  app.delete('/profiles/:id', async (req, reply) => {
    const { id } = idParamSchema.parse(req.params);
    if (!deleteProfile(id)) return reply.code(404).send({ error: 'profile not found' });
    return { deleted: id };
  });

  // --- Letter template live preview (against the sample listing) ----------
  app.post('/letter-preview', async (req) => {
    const input = letterPreviewSchema.parse(req.body);
    return {
      letter: renderApplicationLetter(SAMPLE_LISTING, input),
      sample: {
        addressRaw: SAMPLE_LISTING.addressRaw,
        priceEur: SAMPLE_LISTING.priceEur,
        agency: SAMPLE_LISTING.agency,
      },
    };
  });

  // --- Matches feed (friends only see their own profile's matches) ---------
  app.get('/matches', async (req) => {
    const auth = req.auth as SessionAuth;
    return getMatchesFeed(100, auth.admin ? undefined : (auth.profileId as number));
  });

  app.patch('/matches/:id', async (req, reply) => {
    const auth = req.auth as SessionAuth;
    const { id } = idParamSchema.parse(req.params);
    const { status } = matchStatusSchema.parse(req.body);
    if (!auth.admin) {
      const match = getMatch(id);
      if (!match || match.profileId !== auth.profileId) {
        return reply.code(404).send({ error: 'match not found' });
      }
    }
    const updated = updateMatchStatus(id, status);
    if (!updated) return reply.code(404).send({ error: 'match not found' });
    return updated;
  });

  // --- Health (per-source status for the dashboard) ------------------------
  app.get('/status', async () => {
    const now = Date.now();
    return {
      sources: getKnownSources().map((source) => {
        const lastSuccess = getLastSuccessfulRun(source);
        const recent = getLastRuns(source, 25);
        return {
          source,
          healthy: lastSuccess !== undefined && now - lastSuccess.startedAt.getTime() <= 30 * 60_000,
          lastSuccessAt: lastSuccess?.startedAt ?? null,
          lastRunAt: recent[0]?.startedAt ?? null,
          lastListingsFound: lastSuccess?.listingsFound ?? null,
          newPerDay: getNewListingsPerDay(source, 14),
          recentErrors: recent
            .filter((run) => !run.ok)
            .slice(0, 10)
            .map((run) => ({ at: run.startedAt, error: run.error })),
        };
      }),
    };
  });
};
