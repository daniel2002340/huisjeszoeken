# CLAUDE.md — Delft Rental Alert

## What this is
Personal rental alert system for a few friends searching in Delft. Full spec in PLAN.md —
read it before any task. PLAN.md is the source of truth for architecture, data model,
sources, and phasing.

## Hard rules
- Follow the phasing in PLAN.md §8. Do not build phase-2 features during phase 1.
- No auto-submission of application forms, ever. Alerts + letter only.
- Scraper etiquette (PLAN.md §3) is non-negotiable: page 1 only, jittered intervals,
  backoff on 403/429, never parallel requests to one source.
- Never send real emails during development. All email goes through `notify.ts`, which
  must respect `DRY_RUN=true` (default in dev): log the rendered email to stdout/file
  instead of sending.
- SQLite file lives in `data/` (gitignored). Migrations via drizzle-kit.

## Stack & conventions
- Node 22, TypeScript strict, ESM. pnpm.
- Fastify (API), Vite + React (dashboard, phase 2), better-sqlite3 + Drizzle,
  cheerio for static HTML, Playwright only where PLAN.md says so.
- Every scraper implements `SourceAdapter` (PLAN.md §3) and MUST have unit tests that
  parse a saved HTML fixture from `fixtures/<source>/`. Never test against live sites
  in CI/tests.
- To create or refresh a fixture: `pnpm fixture <source>` (script fetches the live
  page once with realistic headers and saves it). Ask before running it repeatedly.
- Matching: unknown listing fields PASS the filter (over-send, never silently drop).
- Zod-validate all external input (scraped data, API bodies, env).

## Commands
- `pnpm dev` — API + dashboard with DRY_RUN=true and SCRAPERS_ENABLED=false (never polls live sites)
- `pnpm dev:scrape` — same but with the scrape loops on (use sparingly; restarts respect backoff)
- `pnpm test` — vitest (fixture-based scraper tests + matcher/dedupe tests)
- `pnpm fixture <source>` — refresh HTML fixture from live site (use sparingly)
- `pnpm db:migrate` / `pnpm db:studio`

## Definition of done for any task
1. `pnpm test` green, `pnpm tsc --noEmit` clean.
2. New scrapers: fixture + test proving ≥1 listing parses with price, address, URL.
3. Show me a sample: for scrapers, the parsed JSON of the first 3 listings; for email,
   the rendered DRY_RUN output.
