import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Rentumo.nl — SOURCES.md #12, tier-3 aggregator that scrapes other sites
 * itself. Verified: the URL works without the session-bound search_id param,
 * and sort_by=date_desc is honored ("Nieuwste eerst" active). Cards show only
 * the CITY as title, but the detail slug carries the full street + house
 * number (martinus-nijhofflaan-2-v7-551340) — the adapter reconstructs the
 * address from it, which even enables semantic cross-source dedupe.
 * Tests parse fixtures/rentumo/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://rentumo.nl';
const LIST_URL = `${BASE_URL}/huurwoningen?location=delft&sort_by=date_desc&rent=1500&size=41`;

const TYPE_LABELS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  woning: 'house',
  huis: 'house',
};

/** "martinus-nijhofflaan-2-v7-551340" -> "Martinus nijhofflaan 2 v7". */
function streetFromSlug(slug: string, id: string): string | null {
  const withoutId = slug.endsWith(`-${id}`) ? slug.slice(0, -(id.length + 1)) : slug;
  const words = withoutId.replace(/-/g, ' ').trim();
  if (!words) return null;
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const externalId = $card.attr('data-listing-id');
  const href = $card.find('a[href^="/advertentie/"]').first().attr('href');
  if (!externalId || !href) return null;

  const slug = href.split('/').filter(Boolean).at(-1) ?? '';
  const street = streetFromSlug(slug, externalId);

  const city = cleanText($card.find('p').first().text());

  // Facts list: "2 kamers" | "Appartement" | "64 m²" as separate items.
  let rooms: number | null = null;
  let surfaceM2: number | null = null;
  let typeLabel = '';
  $card.find('li').each((_, li) => {
    const text = cleanText($(li).text());
    const kamers = text.match(/^(\d+)\s*kamers?$/i);
    const surface = text.match(/^(\d+)\s*m²$/i);
    if (kamers) rooms ??= Number.parseInt(kamers[1]!, 10);
    else if (surface) surfaceM2 ??= Number.parseInt(surface[1]!, 10);
    else if (text) typeLabel ||= text.toLowerCase();
  });

  const priceEur = parseInteger(cleanText($card.find('strong').first().text()));

  return {
    source: 'rentumo',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: `${street ?? 'Onbekend adres'}, ${city || 'Delft'}`,
    priceEur,
    surfaceM2,
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_LABELS[typeLabel] ?? 'unknown',
    furnished: 'unknown',
    agency: null,
    // Photos are lazy-loaded: the real URL sits in data-src.
    imageUrl:
      $card.find('img[data-src^="http"]').first().attr('data-src') ??
      $card.find('img[src^="http"]').first().attr('src') ??
      null,
    city: city || null,
  };
}

/** Parse a rentumo results page; keeps Delft only. Never fatal per card. */
export function parseRentumoHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('.listing-item[data-listing-id]').each((_, card) => {
    try {
      const listing = parseCard($, $(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[rentumo] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const rentumo: SourceAdapter = {
  name: 'rentumo',
  intervalSec: 600, // aggregator, near-pure duplicates — poll relaxed
  async fetchLatest() {
    return parseRentumoHtml(await fetchHtml(LIST_URL));
  },
};
