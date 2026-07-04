import {
  dbLookup,
  getActiveProfiles,
  getLastRuns,
  insertListing,
  insertMatch,
  markMatchEmailed,
  recordScrapeRun,
} from '../db/repo.js';
import { HttpStatusError } from '../scrapers/http.js';
import { checkDuplicate } from './dedupe.js';
import { matchesProfile } from './matcher.js';
import { normalize } from './normalize.js';
import { notifyMatch } from './notify.js';
import type { SourceAdapter } from './types.js';

/**
 * Cron loops per source (PLAN.md §3): jittered intervals, sequential per
 * source (the next poll is only scheduled after the current run completes),
 * and a 403/429 backoff ladder of 5 min -> 30 min -> 2 h. Every run is logged
 * to scrape_runs. Parser/network failures never crash the loop.
 */

const BACKOFF_LADDER_MS = [5 * 60_000, 30 * 60_000, 2 * 60 * 60_000] as const;
const JITTER = 0.2; // ±20%

const jitteredDelayMs = (intervalSec: number): number =>
  intervalSec * 1000 * (1 - JITTER + Math.random() * 2 * JITTER);

/** Matches errors recorded by runSourceOnce for blocked (backoff-worthy) runs. */
const BLOCKED_ERROR_RE = /^HTTP (403|429) /;

export interface StartupPlan {
  /** Trailing consecutive blocked runs, used to seed the backoff ladder. */
  blockedStreak: number;
  delayMs: number;
}

/**
 * Decide when a source may poll first after (re)start. Restarts must never
 * mean an instant request: a clean source waits one full jittered interval,
 * and a source whose last runs were 403/429 resumes its backoff based on the
 * persisted scrape_runs instead of resetting the ladder.
 */
export function computeStartupPlan(
  recentRuns: Array<{ startedAt: Date; ok: boolean; error: string | null }>,
  intervalSec: number,
  now: Date,
): StartupPlan {
  let blockedStreak = 0;
  for (const run of recentRuns) {
    // newest first
    if (!run.ok && run.error !== null && BLOCKED_ERROR_RE.test(run.error)) blockedStreak += 1;
    else break;
  }

  if (blockedStreak === 0) {
    return { blockedStreak: 0, delayMs: jitteredDelayMs(intervalSec) };
  }

  const rungMs = BACKOFF_LADDER_MS[Math.min(blockedStreak, BACKOFF_LADDER_MS.length) - 1]!;
  const lastRunAt = recentRuns[0]!.startedAt.getTime();
  const remainingMs = lastRunAt + rungMs - now.getTime();
  // Even when the backoff has already elapsed, ease back in after 60s.
  return { blockedStreak, delayMs: Math.min(Math.max(remainingMs, 60_000), rungMs) };
}

export interface RunStats {
  ok: boolean;
  found: number;
  fresh: number;
  /** Set when the source answered 403/429 — triggers the backoff ladder. */
  blockedStatus?: number;
}

/** One full poll of one source: fetch -> normalize -> dedupe -> match -> notify. */
export async function runSourceOnce(adapter: SourceAdapter): Promise<RunStats> {
  const startedAt = new Date();
  let found = 0;
  let fresh = 0;

  try {
    const rawListings = await adapter.fetchLatest();
    found = rawListings.length;

    for (const raw of rawListings) {
      let listing;
      try {
        listing = normalize(raw);
      } catch (error) {
        console.warn(`[${adapter.name}] skipping invalid listing:`, error);
        continue;
      }

      if (checkDuplicate(listing, dbLookup).isDuplicate) continue;

      const row = insertListing(listing);
      if (!row) continue; // insert race: another run already stored it
      fresh += 1;

      for (const profile of getActiveProfiles()) {
        if (!matchesProfile(listing, profile)) continue;
        const match = insertMatch(row.id, profile.id);
        if (!match) continue; // UNIQUE(listing_id, profile_id) guard
        // Feed-only profile: the match shows up on the dashboard, no email.
        if (!profile.emailsEnabled) continue;

        try {
          await notifyMatch(listing, profile);
          markMatchEmailed(match.id);
        } catch (error) {
          // Match stays recorded without emailed_at; do not crash the run.
          console.error(`[${adapter.name}] email for "${profile.name}" failed:`, error);
        }
      }
    }

    recordScrapeRun({ source: adapter.name, startedAt, ok: true, listingsFound: found, newListings: fresh });
    return { ok: true, found, fresh };
  } catch (error) {
    recordScrapeRun({
      source: adapter.name,
      startedAt,
      ok: false,
      listingsFound: found,
      newListings: fresh,
      error: error instanceof Error ? error.message : String(error),
    });
    console.error(`[${adapter.name}] run failed:`, error instanceof Error ? error.message : error);

    const blockedStatus =
      error instanceof HttpStatusError && (error.status === 403 || error.status === 429)
        ? error.status
        : undefined;
    return { ok: false, found, fresh, blockedStatus };
  }
}

export interface SchedulerHandle {
  stop(): void;
}

export function startScheduler(adapters: SourceAdapter[]): SchedulerHandle {
  let stopped = false;
  const timers = new Set<NodeJS.Timeout>();
  const consecutiveBlocks = new Map<string, number>();

  const schedule = (adapter: SourceAdapter, delayMs: number): void => {
    if (stopped) return;
    const timer = setTimeout(() => {
      timers.delete(timer);
      void run(adapter);
    }, delayMs);
    timers.add(timer);
  };

  const run = async (adapter: SourceAdapter): Promise<void> => {
    const stats = await runSourceOnce(adapter);

    let delayMs: number;
    if (stats.blockedStatus !== undefined) {
      const blocks = (consecutiveBlocks.get(adapter.name) ?? 0) + 1;
      consecutiveBlocks.set(adapter.name, blocks);
      delayMs = BACKOFF_LADDER_MS[Math.min(blocks, BACKOFF_LADDER_MS.length) - 1]!;
      console.warn(
        `[${adapter.name}] HTTP ${stats.blockedStatus} — backing off ${Math.round(delayMs / 60_000)} min`,
      );
    } else {
      consecutiveBlocks.set(adapter.name, 0);
      delayMs = jitteredDelayMs(adapter.intervalSec);
      console.log(
        `[${adapter.name}] ${stats.ok ? 'ok' : 'failed'}: ${stats.found} found, ${stats.fresh} new — next in ${Math.round(delayMs / 1000)}s`,
      );
    }
    schedule(adapter, delayMs);
  };

  if (adapters.length === 0) {
    console.log('[scheduler] no adapters registered');
  } else {
    console.log(`[scheduler] polling: ${adapters.map((a) => a.name).join(', ')}`);
    for (const adapter of adapters) {
      const plan = computeStartupPlan(getLastRuns(adapter.name, 10), adapter.intervalSec, new Date());
      if (plan.blockedStreak > 0) {
        consecutiveBlocks.set(adapter.name, plan.blockedStreak);
        console.warn(
          `[${adapter.name}] resuming backoff (${plan.blockedStreak} blocked run(s) before restart) — first poll in ${Math.round(plan.delayMs / 60_000)} min`,
        );
      } else {
        console.log(`[${adapter.name}] first poll in ${Math.round(plan.delayMs / 1000)}s`);
      }
      schedule(adapter, plan.delayMs);
    }
  }

  return {
    stop() {
      stopped = true;
      for (const timer of timers) clearTimeout(timer);
      timers.clear();
    },
  };
}
