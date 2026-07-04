# Delft Rental Alert — Implementation Plan

Personal-use rental alert system (Stekkies-style) for a few friends searching in Delft.
Monitors Dutch rental sites every few minutes, deduplicates listings, matches them against
per-person search profiles, and emails an alert containing the listing details plus a
ready-to-paste application letter. Runs on an always-on Mac Mini.

**Explicitly out of scope:** auto-submitting application forms, commercial use, payments,
multi-tenant auth. This is a private tool for ~3–6 known users.

---

## 1. Stack

| Concern        | Choice                                   | Rationale |
|----------------|------------------------------------------|-----------|
| Runtime        | Node 22 + TypeScript                     | Familiar stack |
| Scheduler      | node-cron (in-process)                   | No Redis/BullMQ needed at this scale |
| HTTP scraping  | undici fetch + cheerio                   | Fast path for lenient sites |
| Browser scraping | Playwright (chromium, headless)        | For Cloudflare/JS-heavy sites (Funda) |
| Database       | SQLite via better-sqlite3 + Drizzle (or Prisma) | Zero-ops, single file, easy backup |
| Email          | Nodemailer → Gmail SMTP (app password) or Resend free tier | A few dozen mails/day max |
| Dashboard API  | Fastify                                  | Familiar |
| Dashboard UI   | Vite + React SPA served by Fastify static | Familiar; single deployable |
| Deployment     | Docker Compose on Mac Mini (or launchd)  | Auto-restart, log rotation |
| Remote access  | Tailscale (already on the Mac Mini)      | Dashboard reachable only on tailnet |

Single repo, single service. Suggested layout:

```
src/
  scrapers/          # one adapter per source
    pararius.ts
    huurwoningen.ts
    kamernet.ts
    funda.ts         # phase 2
    makelaars/       # phase 2, per-agency adapters
  core/
    scheduler.ts     # cron loops with per-source interval + jitter
    normalize.ts     # raw listing -> Listing
    dedupe.ts
    matcher.ts
    letter.ts        # template interpolation
    notify.ts        # email composition + send
  db/
    schema.ts
    migrations/
  api/               # Fastify routes for dashboard
  web/               # Vite SPA
```

---

## 2. Data model

```sql
listings (
  id INTEGER PK,
  source TEXT,             -- 'pararius' | 'huurwoningen' | ...
  external_id TEXT,        -- source-specific id or URL slug
  url TEXT,
  address_raw TEXT,
  street TEXT, house_no TEXT, postcode TEXT, city TEXT,
  price_eur INTEGER,       -- monthly, excl/incl unknown -> store as shown
  surface_m2 INTEGER NULL,
  bedrooms INTEGER NULL,
  property_type TEXT,      -- 'apartment' | 'studio' | 'room' | 'house' | 'unknown'
  furnished TEXT,          -- 'furnished' | 'unfurnished' | 'shell' | 'unknown'
  agency TEXT NULL,
  image_url TEXT NULL,
  first_seen_at DATETIME,
  dedupe_key TEXT,         -- normalized street+houseno+price bucket
  UNIQUE(source, external_id)
)

profiles (
  id INTEGER PK,
  name TEXT,               -- e.g. "Anna & Tom"
  emails TEXT,             -- JSON array, couple = 2 recipients
  min_price INTEGER, max_price INTEGER,
  min_bedrooms INTEGER NULL,
  min_surface_m2 INTEGER NULL,
  property_types TEXT,     -- JSON array: ["apartment","studio","room"]
  furnished_pref TEXT,     -- 'any' | 'furnished' | 'unfurnished'
  letter_template TEXT,    -- with {placeholders}
  letter_vars TEXT,        -- JSON: names, situation blurb, income statement line, etc.
  active BOOLEAN DEFAULT 1
)

matches (
  id INTEGER PK,
  listing_id INTEGER FK,
  profile_id INTEGER FK,
  emailed_at DATETIME,
  status TEXT DEFAULT 'new',   -- 'new' | 'responded' | 'viewing' | 'rejected' | 'won'
  UNIQUE(listing_id, profile_id)
)

scrape_runs (
  id INTEGER PK,
  source TEXT, started_at DATETIME,
  ok BOOLEAN, listings_found INTEGER, new_listings INTEGER,
  error TEXT NULL
)
```

**Dedupe:** exact `(source, external_id)` first; cross-source via `dedupe_key` =
`slug(street) + house_no + round(price/25)`. On cross-source duplicate, keep the earliest
listing and skip notification.

**Unknown-friendly matching:** if a listing field is `unknown` (e.g. bedrooms not parsed),
it should still match — Stekkies deliberately over-sends rather than silently dropping
possible matches. Better a false positive than a missed house.

---

## 3. Scraper adapters

Common interface:

```ts
interface SourceAdapter {
  name: string;
  intervalSec: number;          // 60–180 with ±20% jitter
  fetchLatest(): Promise<RawListing[]>;  // page 1, sorted by newest, Delft only
  // Optional: called once per NEW listing (after dedupe) to fill in what the
  // card lacks — typically the full address, for the postcode filter (§4) and
  // cross-source dedupe (§2). Failure = keep card data (over-send, never drop).
  enrich?(raw: RawListing): Promise<Partial<RawListing> | null>;
}
```

Etiquette / robustness rules (apply to all adapters):
- Only fetch the first results page, pre-filtered to Delft, sorted newest-first.
- Randomized realistic User-Agent per session; keep cookies between polls.
- Jittered intervals; never parallel-hammer one source.
- Detail-page (enrich) requests only for listings never seen before — at most one
  per listing ever, with a jittered ~1 s pause before each.
- On HTTP 403/429: exponential backoff (5 min → 30 min → 2 h) and log to `scrape_runs`.
- Parser failures (site redesign) must alert the admin (see §6), not crash the loop.

### Phase 1 sources
1. **Pararius** — `https://www.pararius.nl/huurwoningen/delft` (newest first). Static HTML,
   cheerio works. Richest structured data (price, m², rooms, furnished, agency).
2. **Huurwoningen.nl** — city page for Delft. Static HTML. Catches smaller agencies.
3. **Kamernet** — Delft rooms/studios/apartments. Listing index is public; details partly
   paywalled. Alert with whatever the card shows + link.

### Phase 2 sources
4. **Funda huur** — Delft rentals. Cloudflare-protected → Playwright with persistent
   browser context. Try their internal JSON endpoints from the network tab first;
   fall back to DOM parsing.
5. **Local Delft agencies (3–5)** — agencies often publish on their own site before the
   aggregators; this is where the real head start is. Pick during phase 2 by checking
   which agencies appear most on phase-1 matches, then build tiny adapters for their
   /aanbod pages (usually simple WordPress/CMS listing grids).

---

## 4. Matching & the application letter

On each new (non-duplicate) listing:
1. Evaluate against all active profiles (price, type, bedrooms, surface, furnished —
   unknown passes).
2. For every match, render the profile's letter template:

```
Geachte {makelaar_of_verhuurder},

Met veel interesse zagen wij de woning aan de {adres} in Delft.
{intro_blurb}

{inkomen_zin}
Wij kunnen per direct reageren en zijn flexibel voor een bezichtiging.

Met vriendelijke groet,
{namen}
{telefoon}
```

Placeholders filled from `letter_vars` + listing fields. `{makelaar_of_verhuurder}` falls
back to "heer/mevrouw" when the agency is unknown. Keep it template-only in v1
(instant, deterministic). Optional later: Claude Haiku pass to reference one detail from
the listing description.

---

## 5. Email notification

- One email per match per profile, to all addresses in `profiles.emails`.
- **Subject:** `🏠 €1.450 — Voorstraat 12, Delft (62 m², 2 slk) — Pararius`
- **Body (HTML):** photo, key facts table, big button to the listing URL, then the fully
  rendered letter in a monospace block with the instruction "kopieer en plak in het
  contactformulier". Plain-text alternative included.
- **Speed note for users:** each friend sets a Gmail filter on the sender →
  "Never send to spam" + "Always mark important", and enables mobile notifications for
  Important mail. Document this in the dashboard's help page.
- Sender: dedicated Gmail with app password (simplest) or Resend free tier with a
  domain he already owns (better deliverability, still free at this volume).

---

## 6. Dashboard (Fastify + Vite SPA, Tailscale-only)

Pages:
1. **Profiles** — CRUD for search profiles, letter template editor with live preview
   using a sample listing, activate/deactivate toggle.
2. **Matches feed** — reverse-chronological matches with photo/price/link; status buttons
   (responded / viewing / rejected) so friends can track their hunt. Optionally share
   dashboard access with friends later via Tailscale invite or Funnel; v1 = admin-only.
3. **Health** — per-source last successful run, new-listings-per-day sparkline, recent
   errors from `scrape_runs`.

Admin alerting: if a source has no successful run for >30 min, or a parser returns 0
listings 5× in a row (likely redesign), email the admin.

No auth in v1 (tailnet-only exposure); add a shared password if it's ever exposed further.

---

## 7. Deployment on the Mac Mini

- Docker Compose: one `app` container (Node + Playwright base image
  `mcr.microsoft.com/playwright`), volume-mounted `data/` for SQLite + logs.
  `restart: unless-stopped`.
- Alternative without Docker: `launchd` plist with `KeepAlive`, Node via nvm.
- Nightly cron: copy `data/app.db` to a dated backup (keep 14 days).
- Dashboard bound to the Tailscale interface only.

---

## 8. Phasing

**Phase 1 — MVP (a weekend):**
Pararius + Huurwoningen.nl adapters, SQLite schema, dedupe, matcher, email with letter,
profiles via seed script, deploy on Mac Mini. Ship it — friends start getting alerts.

**Phase 2:**
Kamernet + Funda (Playwright), 3–5 local Delft agency adapters, dashboard v1
(profiles CRUD + matches feed + health), admin alerting.

**Phase 3 (nice-to-have):**
Cross-source dedupe tuning, Claude Haiku letter personalization, per-profile digest mode
(instant vs hourly), friend access to the matches feed.

---

## 9. Notes & caveats

- Scraping conflicts with most sites' terms of service. Low-frequency, page-1-only,
  personal-use polling is deliberately gentle, but the risk (IP block) is accepted and
  handled via backoff. No circumvention beyond normal browser behavior (Playwright).
- No auto-submission of forms: the human clicks send. This keeps the tool legally and
  ethically simple and avoids CAPTCHA warfare.
- Social housing (Woonnet/ROOM.nl/DUWO) is intentionally excluded — those are
  registration/lottery systems where reaction speed is irrelevant.
