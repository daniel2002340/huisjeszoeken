import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { SessionAuth } from '../api/auth.js';
import type { ListingLookup } from '../core/dedupe.js';
import type { Listing } from '../core/types.js';
import { db } from './client.js';
import { listings, matches, profiles, scrapeRuns, sessions } from './schema.js';

export type ListingRow = typeof listings.$inferSelect;
export type ProfileRow = typeof profiles.$inferSelect;
export type MatchRow = typeof matches.$inferSelect;

export const dbLookup: ListingLookup = {
  findBySourceExternalId: (source, externalId) =>
    db
      .select()
      .from(listings)
      .where(and(eq(listings.source, source), eq(listings.externalId, externalId)))
      .get(),
  findByDedupeKey: (dedupeKey) =>
    db.select().from(listings).where(eq(listings.dedupeKey, dedupeKey)).get(),
};

/** Insert a new listing; returns undefined when (source, external_id) already exists. */
export function insertListing(listing: Listing): ListingRow | undefined {
  return db.insert(listings).values(listing).onConflictDoNothing().returning().get();
}

export function getActiveProfiles(): ProfileRow[] {
  return db.select().from(profiles).where(eq(profiles.active, true)).all();
}

/** Insert a match; the UNIQUE(listing_id, profile_id) guard makes repeats a no-op. */
export function insertMatch(listingId: number, profileId: number): MatchRow | undefined {
  return db.insert(matches).values({ listingId, profileId }).onConflictDoNothing().returning().get();
}

export function markMatchEmailed(matchId: number): void {
  db.update(matches).set({ emailedAt: new Date() }).where(eq(matches.id, matchId)).run();
}

export function recordScrapeRun(run: {
  source: string;
  startedAt: Date;
  ok: boolean;
  listingsFound: number;
  newListings: number;
  error?: string;
}): void {
  db.insert(scrapeRuns)
    .values({ ...run, error: run.error ?? null })
    .run();
}

// ---------------------------------------------------------------------------
// Dashboard API (PLAN.md §6)
// ---------------------------------------------------------------------------

export type ProfileInput = Omit<typeof profiles.$inferInsert, 'id'>;

export function getProfiles(): ProfileRow[] {
  return db.select().from(profiles).all();
}

export function getProfile(id: number): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.id, id)).get();
}

export function createProfile(input: ProfileInput): ProfileRow {
  return db.insert(profiles).values(input).returning().get();
}

export function updateProfile(id: number, input: ProfileInput): ProfileRow | undefined {
  return db.update(profiles).set(input).where(eq(profiles.id, id)).returning().get();
}

/** Delete a profile and its matches + sessions (FK) in one transaction. */
export function deleteProfile(id: number): boolean {
  return db.transaction((tx) => {
    tx.delete(matches).where(eq(matches.profileId, id)).run();
    tx.delete(sessions).where(eq(sessions.profileId, id)).run();
    const deleted = tx.delete(profiles).where(eq(profiles.id, id)).returning().get();
    return deleted !== undefined;
  });
}

// ---------------------------------------------------------------------------
// Dashboard login (username/password on profiles + session tokens)
// ---------------------------------------------------------------------------

export function getProfileByUsername(username: string): ProfileRow | undefined {
  return db.select().from(profiles).where(eq(profiles.username, username)).get();
}

export function createSession(token: string, profileId: number | null, expiresAt: Date): void {
  db.insert(sessions).values({ token, profileId, expiresAt }).run();
}

export function deleteSession(token: string): void {
  db.delete(sessions).where(eq(sessions.token, token)).run();
}

/** Invalidate all sessions of a profile (login removed / password changed). */
export function deleteSessionsForProfile(profileId: number): void {
  db.delete(sessions).where(eq(sessions.profileId, profileId)).run();
}

export function deleteExpiredSessions(now = new Date()): void {
  db.delete(sessions).where(lt(sessions.expiresAt, now)).run();
}

/** Resolve a session token to who is logged in; expired tokens are pruned. */
export function getSessionAuth(token: string, now = new Date()): SessionAuth | undefined {
  const row = db.select().from(sessions).where(eq(sessions.token, token)).get();
  if (!row) return undefined;
  if (row.expiresAt.getTime() <= now.getTime()) {
    deleteSession(token);
    return undefined;
  }
  if (row.profileId === null) return { token, profileId: null, name: 'admin', admin: true };
  const profile = db.select().from(profiles).where(eq(profiles.id, row.profileId)).get();
  if (!profile) {
    deleteSession(token);
    return undefined;
  }
  return { token, profileId: profile.id, name: profile.name, admin: false };
}

/** Reverse-chronological matches feed; pass profileId to scope to one user. */
export function getMatchesFeed(limit = 100, profileId?: number) {
  return db
    .select({
      id: matches.id,
      status: matches.status,
      emailedAt: matches.emailedAt,
      profileId: matches.profileId,
      profileName: profiles.name,
      listing: {
        url: listings.url,
        addressRaw: listings.addressRaw,
        city: listings.city,
        priceEur: listings.priceEur,
        surfaceM2: listings.surfaceM2,
        bedrooms: listings.bedrooms,
        propertyType: listings.propertyType,
        furnished: listings.furnished,
        agency: listings.agency,
        imageUrl: listings.imageUrl,
        source: listings.source,
        firstSeenAt: listings.firstSeenAt,
      },
    })
    .from(matches)
    .innerJoin(listings, eq(matches.listingId, listings.id))
    .innerJoin(profiles, eq(matches.profileId, profiles.id))
    .where(profileId === undefined ? undefined : eq(matches.profileId, profileId))
    .orderBy(desc(matches.id))
    .limit(limit)
    .all();
}

export function getMatch(id: number): MatchRow | undefined {
  return db.select().from(matches).where(eq(matches.id, id)).get();
}

export function updateMatchStatus(id: number, status: string): MatchRow | undefined {
  return db.update(matches).set({ status }).where(eq(matches.id, id)).returning().get();
}

export function getKnownSources(): string[] {
  return db
    .selectDistinct({ source: scrapeRuns.source })
    .from(scrapeRuns)
    .all()
    .map((r) => r.source);
}

export function getLastRuns(source: string, limit: number) {
  return db
    .select()
    .from(scrapeRuns)
    .where(eq(scrapeRuns.source, source))
    .orderBy(desc(scrapeRuns.id))
    .limit(limit)
    .all();
}

export function getLastSuccessfulRun(source: string) {
  return db
    .select()
    .from(scrapeRuns)
    .where(and(eq(scrapeRuns.source, source), eq(scrapeRuns.ok, true)))
    .orderBy(desc(scrapeRuns.id))
    .limit(1)
    .get();
}

/** New listings per day for the sparkline, oldest day first. */
export function getNewListingsPerDay(source: string, days: number): Array<{ day: string; count: number }> {
  const day = sql<string>`date(${scrapeRuns.startedAt}, 'unixepoch')`;
  return db
    .select({ day, count: sql<number>`sum(${scrapeRuns.newListings})` })
    .from(scrapeRuns)
    .where(
      and(eq(scrapeRuns.source, source), sql`${scrapeRuns.startedAt} >= unixepoch('now', ${`-${days} days`})`),
    )
    .groupBy(day)
    .orderBy(day)
    .all();
}
