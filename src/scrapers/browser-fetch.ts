import type { BrowserContext, Page } from 'playwright';
import { HttpStatusError } from './http.js';

/**
 * Browser-based fetch for Cloudflare-challenged sources (pararius, huislijn,
 * huurwoningen). Since ~2026-07 these serve `cf-mitigated: challenge` to every
 * plain HTTP client: the cf_clearance cookie is bound to the TLS fingerprint,
 * so even a browser-harvested cookie is rejected when replayed through undici
 * (verified with scripts/cf-explore.ts, 2026-07-04). Headed Chromium passes the
 * challenge automatically; headless is detected and loops on it forever. We
 * stay within PLAN.md §9 — a real browser, no fingerprint spoofing or stealth
 * patches — which means this only works where a display is available
 * (bare-metal launchd on the Mini, not Docker; see DEPLOY.md).
 *
 * One persistent headed Chromium context, lazily launched, shared by all
 * callers; navigations are serialized (PLAN.md §3: never parallel requests).
 * The profile dir must ONLY ever be used headed: a headless run against it
 * taints the session and Cloudflare re-challenges even subsequent headed use.
 */

// Separate from the funda diagnostic profile (data/browser-profile) so a
// headless funda-explore run can never taint this session. In data/ (gitignored).
const PROFILE_DIR = 'data/browser-profile-cf';

/** Detect the Cloudflare interstitial ("Just a moment... / Even geduld...").
 * `_cf_chl_opt` is the embedded challenge config and appears only there —
 * verified absent from real pararius/huislijn/huurwoningen pages. */
export const isChallengeHtml = (html: string): boolean => html.includes('_cf_chl_opt');

const CHALLENGE_POLL_MS = 3_000;
const CHALLENGE_MAX_POLLS = 10;
const GOTO_TIMEOUT_MS = 45_000;

let contextPromise: Promise<BrowserContext> | null = null;

async function launchContext(): Promise<BrowserContext> {
  // Dynamic import: playwright is a devDependency, absent from the production
  // Docker image (which cannot run headed anyway). The app must boot without
  // it; only these sources' runs fail, and the failure names the fix.
  let chromium: (typeof import('playwright'))['chromium'];
  try {
    ({ chromium } = await import('playwright'));
  } catch {
    throw new Error(
      'playwright is not installed — Cloudflare-challenged sources need the bare-metal deploy (DEPLOY.md: pnpm install && pnpm exec playwright install chromium)',
    );
  }
  const context = await chromium.launchPersistentContext(PROFILE_DIR, {
    headless: false,
    viewport: { width: 1440, height: 900 },
    locale: 'nl-NL',
    timezoneId: 'Europe/Amsterdam',
  });
  context.on('close', () => {
    contextPromise = null;
  });
  return context;
}

async function getPage(): Promise<Page> {
  contextPromise ??= launchContext();
  let context: BrowserContext;
  try {
    context = await contextPromise;
  } catch (error) {
    contextPromise = null; // relaunch on the next poll
    throw error;
  }
  return context.pages()[0] ?? (await context.newPage());
}

async function fetchOnce(url: string): Promise<string> {
  const page = await getPage();
  const response = await page.goto(url, {
    waitUntil: 'domcontentloaded',
    timeout: GOTO_TIMEOUT_MS,
  });

  // The managed challenge answers 403 + cf-mitigated: challenge, then solves
  // itself and reloads. Poll until the interstitial is gone; page.content()
  // can throw mid-reload ("execution context destroyed"), which just means
  // "not settled yet".
  for (let poll = 0; poll <= CHALLENGE_MAX_POLLS; poll += 1) {
    const html = await page.content().catch(() => null);
    if (html !== null && !isChallengeHtml(html)) {
      const status = response?.status() ?? 200;
      // A non-challenge error page (real 404/500) must still surface.
      if (response !== null && !response.ok() && response.headers()['cf-mitigated'] !== 'challenge') {
        throw new HttpStatusError(status, url);
      }
      return html;
    }
    await page.waitForTimeout(CHALLENGE_POLL_MS);
  }
  // Still challenged: report it as a 403 so the scheduler's backoff ladder
  // (5 min -> 30 min -> 2 h) applies exactly as for plain-fetch blocks.
  throw new HttpStatusError(403, url);
}

// Serialize all navigations through the single shared page (PLAN.md §3).
let queue: Promise<unknown> = Promise.resolve();

export function fetchHtmlViaBrowser(url: string): Promise<string> {
  const run = queue.then(() => fetchOnce(url));
  queue = run.catch(() => undefined);
  return run;
}
