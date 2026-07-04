import { mkdirSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';

// Exploration/diagnostic tool for the Funda adapter (PLAN.md §3 phase 2).
// Usage: tsx scripts/funda-explore.ts <shell|chromium|headed>
// Captures JSON responses + final HTML to the OUT dir. Not a scraper loop —
// single navigation per invocation.

const OUT =
  process.env.FUNDA_CAPTURE_DIR ??
  '/private/tmp/claude-501/-Users-daniel-WebstormProjects-huisjeszoeken/8038051d-09db-4c9f-b48f-8442e2651788/scratchpad/funda-capture';
mkdirSync(OUT, { recursive: true });

const mode = process.argv[2] ?? 'chromium';

const context = await chromium.launchPersistentContext('data/browser-profile', {
  headless: mode !== 'headed',
  ...(mode === 'chromium' ? { channel: 'chromium' as const } : {}),
  viewport: { width: 1440, height: 900 },
  locale: 'nl-NL',
  timezoneId: 'Europe/Amsterdam',
});

const page = context.pages()[0] ?? (await context.newPage());
let counter = 0;
const seen: string[] = [];

page.on('response', (res) => {
  const url = res.url();
  const type = res.headers()['content-type'] ?? '';
  if (!type.includes('json')) return;
  counter += 1;
  const id = counter;
  seen.push(`${res.status()} ${url}`);
  res
    .text()
    .then((body) => {
      if (body.length > 500) {
        writeFileSync(`${OUT}/res-${mode}-${String(id).padStart(2, '0')}.json`, `${url}\n---\n${body}`);
      }
    })
    .catch(() => {});
});

const target =
  'https://www.funda.nl/zoeken/huur?selected_area=%5B%22delft%22%5D&sort=%22date_down%22';
console.log(`[${mode}] navigating to`, target);
const response = await page
  .goto(target, { waitUntil: 'networkidle', timeout: 45_000 })
  .catch((e) => {
    console.log('goto error:', String(e).slice(0, 200));
    return null;
  });
console.log('main response status:', response?.status());
console.log('page title:', await page.title().catch(() => '?'));

await page.waitForTimeout(4000);

const html = await page.content().catch(() => '');
writeFileSync(`${OUT}/page-${mode}.html`, html);
console.log('html length:', html.length);
console.log(`json responses seen: ${seen.length}`);
for (const s of seen) console.log(' ', s.slice(0, 160));

await context.close();
