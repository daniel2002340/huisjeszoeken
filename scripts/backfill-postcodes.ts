import { eq, isNull, inArray } from 'drizzle-orm';
import { parseAddress } from '../src/core/normalize.js';
import type { RawListing, SourceAdapter } from '../src/core/types.js';
import { db } from '../src/db/client.js';
import { listings, matches, profiles } from '../src/db/schema.js';
import { buurtje } from '../src/scrapers/buurtje.js';
import { huizenvinder } from '../src/scrapers/huizenvinder.js';
import { huurstunt } from '../src/scrapers/huurstunt.js';
import { huurwoningportaal } from '../src/scrapers/huurwoningportaal.js';

/**
 * One-off backfill (2026-07): give EXISTING listings the postcode that
 * enrichment now provides for new ones, then drop the feed matches that
 * provably contradict a profile's district filter.
 *
 * Deliberately NOT done by deleting old listings: the scheduler would see
 * everything as new again and re-alert every friend about the entire current
 * market (DRY_RUN is off in production).
 *
 * - listing rows: only the postcode column is updated — addressRaw/dedupeKey
 *   stay untouched so dedupe history is stable
 * - matches: only status 'new' is deleted; anything a friend acted on
 *   (responded/viewing/...) is kept
 * - detail pages of old listings may be gone (404) — skipped, postcode stays
 *   null (over-send)
 *
 * Usage: pnpm exec tsx scripts/backfill-postcodes.ts          # dry run
 *        pnpm exec tsx scripts/backfill-postcodes.ts --apply  # do it
 */

const APPLY = process.argv.includes('--apply');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Sources with a working enrich(); huure needs no fetch (district is in addressRaw).
const ENRICHABLE: Record<string, SourceAdapter> = {
  buurtje,
  huizenvinder,
  huurstunt,
  huurwoningportaal,
};

const rows = db.select().from(listings).where(isNull(listings.postcode)).all();
console.log(`${rows.length} listings without postcode (${APPLY ? 'APPLY' : 'dry run'})`);

let filled = 0;
let failed = 0;
let skipped = 0;

for (const row of rows) {
  let postcode: string | null = null;

  if (row.source === 'huure') {
    postcode = row.addressRaw.match(/\((\d{4})\)/)?.[1] ?? null;
  } else if (ENRICHABLE[row.source]) {
    const raw: RawListing = {
      source: row.source,
      externalId: row.externalId,
      url: row.url,
      addressRaw: row.addressRaw,
      priceEur: row.priceEur,
      city: row.city,
    };
    await sleep(1_000 + Math.random() * 400); // same-host etiquette
    try {
      const extra = await ENRICHABLE[row.source]!.enrich!(raw);
      postcode =
        extra?.postcode ??
        (extra?.addressRaw ? parseAddress(extra.addressRaw).postcode : null);
    } catch (error) {
      failed += 1;
      console.warn(`  ! ${row.source} ${row.addressRaw}: ${error instanceof Error ? error.message : error}`);
      continue;
    }
  } else {
    skipped += 1; // source without enrichment (rentfinder, marktplaats, ...)
    continue;
  }

  if (!postcode) {
    failed += 1;
    continue;
  }
  filled += 1;
  console.log(`  ${row.source}: ${row.addressRaw} -> ${postcode}`);
  if (APPLY) {
    db.update(listings).set({ postcode }).where(eq(listings.id, row.id)).run();
  }
}

console.log(`\npostcodes: ${filled} filled, ${failed} not resolvable, ${skipped} skipped (no enrichment for source)`);

// --- Feed cleanup: matches that now provably violate the district filter ---
const allProfiles = db.select().from(profiles).all();
const joined = db
  .select({
    matchId: matches.id,
    status: matches.status,
    profileId: matches.profileId,
    postcode: listings.postcode,
    addressRaw: listings.addressRaw,
    source: listings.source,
  })
  .from(matches)
  .innerJoin(listings, eq(matches.listingId, listings.id))
  .all();

const toDelete: number[] = [];
for (const profile of allProfiles) {
  if (profile.postcodes.length === 0) continue;
  for (const m of joined) {
    if (m.profileId !== profile.id || m.postcode === null) continue;
    if (profile.postcodes.includes(m.postcode.slice(0, 4))) continue;
    if (m.status !== 'new') {
      console.log(`  keeping acted-on match (${m.status}): "${profile.name}" ${m.source} ${m.addressRaw}`);
      continue;
    }
    toDelete.push(m.matchId);
    console.log(`  drop match: "${profile.name}" ${m.source} ${m.addressRaw} (${m.postcode})`);
  }
}

if (APPLY && toDelete.length > 0) {
  db.delete(matches).where(inArray(matches.id, toDelete)).run();
}
console.log(`\nmatches outside district filter: ${toDelete.length} ${APPLY ? 'deleted' : 'would be deleted (rerun with --apply)'}`);
