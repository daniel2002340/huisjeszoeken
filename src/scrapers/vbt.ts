import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { Furnished, PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * vb&t Verhuurmakelaars — SOURCES.md #21. Server-rendered Svelte cards on a
 * NATIONAL list (12 per page, paginated). No usable server-side city filter
 * exists (/zoeken?q= is a member search that redirects to signup), so the
 * adapter parses page 1 and keeps Delft. Verified: page 1 is newest-first
 * (fresh cards have 0 "reacties", older ones dozens), so a new Delft listing
 * surfaces on page 1. vb&t often rents out exclusive new-build projects; no
 * Delft inventory at build time — the Delft filter is tested synthetically.
 * Tests parse fixtures/vbt/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://vbtverhuurmakelaars.nl';
const LIST_URL = `${BASE_URL}/woningen`;

const TYPE_MAP: Record<string, PropertyType> = {
  appartement: 'apartment',
  woning: 'house',
  woonhuis: 'house',
  huis: 'house',
  studio: 'studio',
  kamer: 'room',
};

const furnishedOf = (cardText: string): Furnished => {
  const lower = cardText.toLowerCase();
  if (/gemeubileerd/.test(lower)) return 'furnished';
  if (/gestoffeerd/.test(lower)) return 'unfurnished';
  if (/\bkaal\b/.test(lower)) return 'shell';
  return 'unknown';
};

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const href = $card.attr('href');
  if (!href) return null;
  const externalId = href.replace(/\/+$/, '').split('/').at(-1) ?? href;

  const city = cleanText($card.find('.items > div').first().text());
  const street = cleanText($card.find('.items span.normal').first().text());
  if (!street) return null;

  // Facts table: label -> value rows.
  const facts = new Map<string, string>();
  $card.find('table tr').each((_, tr) => {
    const cells = $(tr).find('td');
    if (cells.length === 2) {
      facts.set(cleanText(cells.first().text()).toLowerCase(), cleanText(cells.eq(1).text()));
    }
  });

  const status = cleanText($card.find('.status').first().text());
  if (/verhuurd/i.test(status)) return null;

  const rooms = parseInteger(facts.get('kamers') ?? '');
  const typeWord = (facts.get('soort object') ?? '').toLowerCase();

  // style="background-image: url(/images/...)"
  const bg = $card.find('.visimage').first().attr('style') ?? '';
  const image = bg.match(/url\((['"]?)([^)'"]+)\1\)/)?.[2];

  return {
    source: 'vbt',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: `${street}, ${city}`,
    priceEur: parseInteger(cleanText($card.find('.price').first().text())),
    surfaceM2: parseInteger(facts.get('woonoppervlakte') ?? ''),
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_MAP[typeWord] ?? 'unknown',
    furnished: furnishedOf($card.text()),
    agency: 'vb&t Verhuurmakelaars',
    imageUrl: image ? new URL(image, BASE_URL).toString() : null,
    city: city || null,
  };
}

/** Parse a vb&t page into ALL listings (national); the adapter filters Delft. */
export function parseVbtHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('a.property').each((_, card) => {
    try {
      const listing = parseCard($, $(card));
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[vbt] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const keepDelft = (listings: RawListing[]): RawListing[] =>
  listings.filter((listing) => listing.city?.toLowerCase() === 'delft');

export const vbt: SourceAdapter = {
  name: 'vbt',
  intervalSec: 180,
  async fetchLatest() {
    return keepDelft(parseVbtHtml(await fetchHtml(LIST_URL)));
  },
};
