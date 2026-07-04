import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Huizen.trovit.nl — SOURCES.md #23, aggregator-of-aggregators (nearly all
 * duplicates; dedupe/matcher handle it). order_by=source_date verified as the
 * newest-first value ("nieuw" badges + "1 dag geleden" at the top). The
 * rooms_min=2 param from SOURCES.md was dropped — it would exclude studios.
 * Cards have NO street address and link via session-bound clk.thribee.com
 * redirect URLs (the only link the site offers). Source portal name is shown
 * per card and stored as agency.
 * Tests parse fixtures/trovit/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://huizen.trovit.nl';
const LIST_URL = `${BASE_URL}/search?type=2&text=delft&geo_id=R324269&price_max=1500&order_by=source_date`;

const TYPE_WORDS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  woning: 'house',
  huis: 'house',
};

// "Appartement in Delft, Zuid-Holland" (the card title).
const TITLE_RE = /\b(Appartement|Studio|Kamer|Woning|Huis)\s+in\s+([A-Za-zÀ-ÿ' -]+?),/i;

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const externalId = $card.attr('data-id');
  const href = $card.find('a[href^="https://clk.thribee.com"]').first().attr('href');
  if (!externalId || !href) return null;

  const cardText = cleanText($card.text());
  const title = cardText.match(TITLE_RE);
  const typeWord = title?.[1]?.toLowerCase() ?? '';
  const city = title?.[2]?.trim() ?? null;

  // Facts sit in their own <p> elements ("64 m²", "2 kamers").
  let surfaceM2: number | null = null;
  let rooms: number | null = null;
  $card.find('p').each((_, el) => {
    const text = cleanText($(el).text());
    const surface = text.match(/^(\d+)\s*m²/);
    const kamers = text.match(/^(\d+)\s*kamers?/i);
    if (surface) surfaceM2 ??= Number.parseInt(surface[1]!, 10);
    if (kamers) rooms ??= Number.parseInt(kamers[1]!, 10);
  });

  return {
    source: 'trovit',
    externalId,
    url: href, // session-bound redirect — the only link trovit offers
    addressRaw: title ? `${title[1]} in ${city}` : cardText.slice(0, 60),
    priceEur: parseInteger(
      cleanText($card.find('.price__actual').first().text()).match(/€\s?[\d.,]+/)?.[0] ?? '',
    ),
    surfaceM2,
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_WORDS[typeWord] ?? 'unknown',
    furnished: 'unknown',
    agency: cleanText($card.find('small').first().text()) || null, // source portal
    imageUrl:
      $card.find('img[data-src^="http"]').first().attr('data-src') ??
      $card.find('img[src^="https://"][src*="photo"], img[src^="https://images"]').first().attr('src') ??
      null,
    city,
  };
}

/** Parse a trovit results page; keeps Delft only. Never fatal per card. */
export function parseTrovitHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('article.snippet-listing[data-id]').each((_, card) => {
    try {
      const listing = parseCard($, $(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[trovit] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const trovit: SourceAdapter = {
  name: 'trovit',
  intervalSec: 600, // aggregator, near-pure duplicates — poll relaxed
  async fetchLatest() {
    return parseTrovitHtml(await fetchHtml(LIST_URL));
  },
};
