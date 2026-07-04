import { getKnownSources, getLastRuns, getLastSuccessfulRun } from '../db/repo.js';
import { config } from './config.js';
import { sendEmail } from './notify.js';

/**
 * Admin alerting (PLAN.md §6): email the admin when a source has no successful
 * run for >30 min, or when a parser returns 0 listings 5x in a row (likely a
 * site redesign). Alerts go through notify.ts, so DRY_RUN applies.
 */

export const STALE_AFTER_MS = 30 * 60_000;
export const ZERO_STREAK_LENGTH = 5;
const CHECK_INTERVAL_MS = 5 * 60_000;
/** Delay before the first check, so fresh polls can land after a restart. */
const INITIAL_DELAY_MS = 5 * 60_000;
/** Do not repeat the same alert more often than this. */
const REALERT_AFTER_MS = 6 * 60 * 60_000;

export type AlertKind = 'stale' | 'zero-streak';

export interface AlertIssue {
  source: string;
  kind: AlertKind;
  message: string;
}

export interface SourceRunSummary {
  source: string;
  lastSuccessAt: Date | null;
  /** listings_found of the most recent successful runs, newest first. */
  recentOkListingCounts: number[];
}

/** Pure evaluation so the rules are unit-testable. */
export function evaluateSource(summary: SourceRunSummary, now: Date): AlertIssue[] {
  const issues: AlertIssue[] = [];

  if (summary.lastSuccessAt === null) {
    issues.push({
      source: summary.source,
      kind: 'stale',
      message: `${summary.source}: has runs recorded but none ever succeeded`,
    });
  } else {
    const ageMs = now.getTime() - summary.lastSuccessAt.getTime();
    if (ageMs > STALE_AFTER_MS) {
      issues.push({
        source: summary.source,
        kind: 'stale',
        message: `${summary.source}: no successful run for ${Math.round(ageMs / 60_000)} min (last: ${summary.lastSuccessAt.toISOString()})`,
      });
    }
  }

  const recent = summary.recentOkListingCounts.slice(0, ZERO_STREAK_LENGTH);
  if (recent.length >= ZERO_STREAK_LENGTH && recent.every((count) => count === 0)) {
    issues.push({
      source: summary.source,
      kind: 'zero-streak',
      message: `${summary.source}: last ${ZERO_STREAK_LENGTH} successful runs all found 0 listings — parser may be broken (site redesign?)`,
    });
  }

  return issues;
}

function collectSummaries(): SourceRunSummary[] {
  return getKnownSources().map((source) => ({
    source,
    lastSuccessAt: getLastSuccessfulRun(source)?.startedAt ?? null,
    recentOkListingCounts: getLastRuns(source, 25)
      .filter((run) => run.ok)
      .map((run) => run.listingsFound),
  }));
}

async function sendAdminAlert(issues: AlertIssue[]): Promise<void> {
  const lines = issues.map((issue) => `- ${issue.message}`);
  if (!config.ADMIN_EMAIL) {
    console.warn(`[alerts] ADMIN_EMAIL not set — cannot email:\n${lines.join('\n')}`);
    return;
  }
  await sendEmail({
    to: [config.ADMIN_EMAIL],
    subject: `⚠️ huisjeszoeken: ${issues.map((i) => `${i.source} ${i.kind}`).join(', ')}`,
    text: `Scraper health problems detected:\n\n${lines.join('\n')}\n\nSee the Health page on the dashboard for details.`,
    html: `<p>Scraper health problems detected:</p><ul>${issues
      .map((i) => `<li>${i.message}</li>`)
      .join('')}</ul><p>See the Health page on the dashboard for details.</p>`,
  });
}

export interface AlertMonitorHandle {
  stop(): void;
}

export function startAlertMonitor(): AlertMonitorHandle {
  const lastAlertedAt = new Map<string, number>();

  const check = async (): Promise<void> => {
    try {
      const now = new Date();
      const issues = collectSummaries()
        .flatMap((summary) => evaluateSource(summary, now))
        .filter((issue) => {
          const key = `${issue.source}:${issue.kind}`;
          const last = lastAlertedAt.get(key) ?? 0;
          if (now.getTime() - last < REALERT_AFTER_MS) return false;
          lastAlertedAt.set(key, now.getTime());
          return true;
        });
      if (issues.length > 0) {
        console.warn(`[alerts] ${issues.length} issue(s):`, issues.map((i) => i.message).join(' | '));
        await sendAdminAlert(issues);
      }
    } catch (error) {
      console.error('[alerts] check failed:', error);
    }
  };

  const initial = setTimeout(() => void check(), INITIAL_DELAY_MS);
  const interval = setInterval(() => void check(), CHECK_INTERVAL_MS);
  console.log('[alerts] monitoring scrape health (stale >30 min, 5x zero listings)');

  return {
    stop() {
      clearTimeout(initial);
      clearInterval(interval);
    },
  };
}
