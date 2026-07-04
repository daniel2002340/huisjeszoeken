# PROMPTS.md — Claude Code prompts per fase

Werkwijze: start elke fase in **plan mode** (Shift+Tab of `--permission-mode plan`),
review het plan, en laat het dan pas bouwen. Commit na elke geslaagde fase.

---

## Fase 0 — Scaffold + database

```
Read PLAN.md and CLAUDE.md fully.

Scaffold the project: pnpm + TypeScript strict + ESM, vitest, drizzle + better-sqlite3,
Fastify skeleton, folder layout exactly as in PLAN.md §1. Implement the full database
schema from PLAN.md §2 as Drizzle schema + initial migration, plus a seed script that
creates one example profile (couple, €900–€1500, apartment+studio, letter template from
PLAN.md §4 with dummy letter_vars).

Also implement core/normalize.ts (RawListing -> Listing incl. dedupe_key per §2) and
core/dedupe.ts, with unit tests covering: same source+external_id, cross-source same
address+price, and price just inside/outside the ±€25 bucket.

Definition of done per CLAUDE.md.
```

## Fase 1a — Eerste scraper (Pararius) + fixtures

```
Read PLAN.md §3 and CLAUDE.md.

1. Create the `pnpm fixture <source>` script (undici fetch, realistic browser headers,
   saves raw HTML to fixtures/<source>/latest.html).
2. Run it ONCE for pararius (https://www.pararius.nl/huurwoningen/delft, sorted newest).
   If it returns a bot-wall instead of listings, stop and show me the response — do not
   retry in a loop.
3. Build scrapers/pararius.ts implementing SourceAdapter, parsing the fixture with
   cheerio: external_id, url, address, price, m², bedrooms, property_type, furnished,
   agency, image. Unknown fields -> 'unknown'/null, never throw on a single bad card.
4. Fixture-based tests: at least price, address and url parsed for every card in the
   fixture; property_type mapping covered.

Show me the parsed JSON of the first 3 listings.
```

## Fase 1b — Tweede scraper (Huurwoningen.nl)

```
Same procedure as pararius (fixture -> adapter -> tests) for huurwoningen.nl, Delft
city page sorted by newest. Reuse shared parsing helpers where sensible, but keep the
adapter self-contained per PLAN.md §3.
```

## Fase 1c — Scheduler, matcher, e-mail

```
Read PLAN.md §3–§5 and CLAUDE.md.

Implement:
1. core/scheduler.ts: per-adapter loop with intervalSec ±20% jitter, sequential per
   source, 403/429 backoff ladder (5m/30m/2h), every run logged to scrape_runs.
2. core/matcher.ts: new non-duplicate listing -> evaluate all active profiles per
   PLAN.md §4 (unknown passes). Insert into matches with UNIQUE guard.
3. core/letter.ts: template interpolation with fallbacks (§4).
4. core/notify.ts: HTML + plain-text email per PLAN.md §5, Nodemailer SMTP from env,
   DRY_RUN default. Subject format exactly as specified.
5. Wire it together in src/index.ts; graceful shutdown.

Tests for matcher edge cases (unknown fields, price bounds, inactive profile) and a
snapshot test of the rendered email. Then run `pnpm dev` briefly and show me one full
DRY_RUN email for a real listing.
```

## Fase 1d — Deploy op de Mac Mini

```
Read PLAN.md §7.

Create a Dockerfile (node:22-slim is fine for phase 1 — no Playwright yet) and
docker-compose.yml: app service, restart unless-stopped, ./data volume, env_file .env.
Add .env.example with all vars (SMTP creds, DRY_RUN, POLL intervals). Add a nightly
backup script for data/app.db (keep 14 days) and document Mac Mini setup steps in
DEPLOY.md, including binding any exposed port to the Tailscale interface only.
```

**Handmatig na 1d:** `.env` invullen, `DRY_RUN=false`, `docker compose up -d`,
een dag meedraaien en de alerts vergelijken met wat je zelf op Pararius ziet.

---

## Fase 2a — Funda via Playwright

```
Read PLAN.md §3 (phase 2) and CLAUDE.md.

Add a Playwright-based adapter for funda huur Delft. First inspect whether an internal
JSON/search endpoint is usable from the page's network traffic; prefer that over DOM
scraping. Persistent browser context stored in data/. Switch the Docker base image to
mcr.microsoft.com/playwright and verify the pararius/huurwoningen adapters still run.
Fixture-based tests: save one captured JSON/HTML response as fixture.
If Funda blocks headless access after reasonable attempts, report back instead of
escalating with evasion tricks.
```

## Fase 2b — Lokale makelaars

```
I've listed 3-5 Delft agency /aanbod URLs in AGENCIES.md [maak dit bestand zelf aan].
For each: fixture -> minimal adapter (address, price, url, image are enough; everything
else unknown) -> test. These pages are simple CMS grids; keep each adapter under ~100
lines.
```

## Fase 2c — Dashboard

```
Read PLAN.md §6.

Build the Fastify API + Vite/React dashboard: profiles CRUD with letter template editor
(live preview against a sample listing), matches feed with status buttons, health page
from scrape_runs. Serve the built SPA from Fastify. No auth (tailnet-only), but add a
single shared-password gate behind an env flag for later. Add the admin alert email:
no successful run for a source in 30 min, or 5 consecutive zero-listing runs.
```

---

## Tips tijdens het bouwen

- **Fixtures zijn de sleutel.** Live sites veranderen en blokkeren; met fixtures kan
  Claude Code snel itereren zonder de sites te hameren, en breekt `pnpm test` zodra
  een site z'n HTML wijzigt (fixture verversen -> test toont wat er stuk is).
- **Eén fase per sessie/context.** Na elke fase committen en zo nodig `/clear` —
  CLAUDE.md + PLAN.md geven elke nieuwe sessie voldoende context.
- **Laat het bewijs zien.** De "show me"-regels in de prompts dwingen af dat je parsed
  output en gerenderde mails ziet vóór je verder gaat — de plek waar scrapers stiekem
  half-werkend kunnen zijn.
- **Parser-drift later:** als een bron stopt met matches leveren, is de prompt simpel:
  "pararius returns 0 listings since yesterday, run pnpm fixture pararius and fix the
  adapter against the new fixture."
