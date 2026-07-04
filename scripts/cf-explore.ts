import { chromium } from 'playwright';

// Diagnostic: does a normal Playwright browser pass the Cloudflare managed
// challenge on pararius/huislijn/huurwoningen? Single navigation per URL.
// Usage: tsx scripts/cf-explore.ts <shell|chromium|headed> [url...]
// Findings 2026-07-04: headed passes instantly (200 + cf_clearance); headless
// (all flavors, any UA) loops on the challenge forever; a cf_clearance cookie
// replayed through undici is rejected (TLS-fingerprint-bound).
// ⚠️ NEVER point CF_PROFILE at data/browser-profile-cf (the production profile
// used by src/scrapers/browser-fetch.ts): one headless run against a profile
// taints it and Cloudflare re-challenges even subsequent headed use.

const mode = process.argv[2] ?? 'chromium';
const urls = process.argv.slice(3).length
  ? process.argv.slice(3)
  : ['https://www.pararius.nl/huurwoningen/delft'];

const context = await chromium.launchPersistentContext(process.env.CF_PROFILE ?? 'data/cf-explore-profile', {
  headless: mode !== 'headed',
  ...(mode === 'chromium' ? { channel: 'chromium' as const } : {}),
  viewport: { width: 1440, height: 900 },
  locale: 'nl-NL',
  timezoneId: 'Europe/Amsterdam',
  ...(process.env.CF_UA ? { userAgent: process.env.CF_UA } : {}),
});

const page = context.pages()[0] ?? (await context.newPage());

for (const url of urls) {
  console.log(`\n[${mode}] navigating to ${url}`);
  const response = await page
    .goto(url, { waitUntil: 'domcontentloaded', timeout: 45_000 })
    .catch((e) => {
      console.log('goto error:', String(e).slice(0, 200));
      return null;
    });
  console.log('initial status:', response?.status());

  // Managed challenge auto-solves and reloads; give it time.
  for (let i = 0; i < 6; i++) {
    await page.waitForTimeout(3000);
    const title = await page.title().catch(() => '?');
    const html = await page.content().catch(() => '');
    const challenged = html.includes('challenges.cloudflare.com') || /momentje|just a moment/i.test(title);
    console.log(`  t+${(i + 1) * 3}s title="${title}" html=${html.length}b challenged=${challenged}`);
    if (!challenged && html.length > 20000) break;
  }

  const cookies = await context.cookies(url);
  const clearance = cookies.find((c) => c.name === 'cf_clearance');
  console.log('cf_clearance:', clearance ? `present (expires ${new Date(clearance.expires * 1000).toISOString()})` : 'absent');
  const html = await page.content().catch(() => '');
  const listingHits = (html.match(/listing-search-item|search-list__item|object-adres|woning/gi) ?? []).length;
  console.log('final html length:', html.length, '| listing-marker hits:', listingHits);
}

await context.close();
