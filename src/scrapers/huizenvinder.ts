import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { extractJsonLdPostcode } from './listing-detail.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Huizenvinder.nl — SOURCES.md #10. Server-rendered; the Delft page shows the
 * whole filtered inventory without pagination, so polling order is
 * irrelevant. Cards look like appartementdelft.nl's (same platform), so
 * expect overlap — dedupe handles it. Cards show street WITHOUT house number
 * → listing-unique dedupe keys via normalize.
 * Tests parse fixtures/huizenvinder/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.huizenvinder.nl';
const LIST_URL = `${BASE_URL}/huren/delft/?types=studio%2Cappartement%2Chuurwoning&surface=40&max_price=1500`;

// First path segment: /huren/appartement-delft/<street>/<id>/
const TYPE_SEGMENTS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  huurwoning: 'house',
  woning: 'house',
};

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const link = $card.find('a[href^="/huren/"]').first();
  const href = link.attr('href');
  if (!href) return null;

  // /huren/appartement-delft/willem-van-aelststraat/99396/
  const segments = href.split('/').filter(Boolean);
  const externalId = segments.at(-1) ?? href;
  if (!/^\d+$/.test(externalId)) return null;
  const typeSegment = (segments[1] ?? '').split('-')[0] ?? '';

  // "Willem van Aelststraat in Delft"
  const title = cleanText($card.find('h3').first().text());
  const inMatch = title.match(/^(.*?)\s+in\s+([A-Za-zÀ-ÿ' -]+)$/);
  const street = inMatch?.[1] ?? title;
  const city = inMatch?.[2]?.trim() ?? null;

  // Facts list: "€ 860 per maand" and "56m² - 2 kamers" as separate items.
  let priceEur: number | null = null;
  let surfaceM2: number | null = null;
  let rooms: number | null = null;
  $card.find('li').each((_, li) => {
    const text = cleanText($(li).text());
    if (text.includes('€')) priceEur ??= parseInteger(text);
    const surface = text.match(/(\d+)\s*m/);
    const kamers = text.match(/(\d+)\s*kamers?/i);
    if (surface && kamers) {
      surfaceM2 ??= Number.parseInt(surface[1]!, 10);
      rooms ??= Number.parseInt(kamers[1]!, 10);
    }
  });

  return {
    source: 'huizenvinder',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: `${street}${city ? `, ${city}` : ''}`,
    priceEur,
    surfaceM2,
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_SEGMENTS[typeSegment] ?? 'unknown',
    furnished: 'unknown', // not on the cards
    agency: null,
    imageUrl: $card.find('img[src^="https://cdn."]').first().attr('src') ?? null,
    city,
  };
}

/** Parse a huizenvinder.nl results page; keeps Delft only. Never fatal per card. */
export function parseHuizenvinderHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('div[id]').each((_, card) => {
    const $card = $(card);
    if (!/^\d+$/.test($card.attr('id') ?? '')) return;
    if ($card.find('a[href^="/huren/"]').length === 0) return;
    try {
      const listing = parseCard($, $card);
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[huizenvinder] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const huizenvinder: SourceAdapter = {
  name: 'huizenvinder',
  intervalSec: 180,
  async fetchLatest() {
    return parseHuizenvinderHtml(await fetchHtml(LIST_URL));
  },
  // Cards show street only; the detail page's JSON-LD carries the postcode.
  async enrich(raw) {
    const postcode = extractJsonLdPostcode(await fetchHtml(raw.url), raw.city ?? 'Delft');
    return postcode ? { postcode } : null;
  },
};
