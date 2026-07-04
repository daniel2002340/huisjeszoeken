import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { extractJsonLdPostcode } from './listing-detail.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Huurstunt.nl — SOURCES.md #11 (tier 3 aggregator; expect tier-1 overlap,
 * dedupe/unique keys handle it). Server-rendered cards next to skeleton
 * placeholders; the skeletons have no detail anchor and are skipped
 * naturally. Detail URL pattern: /{type}/huren/in/{city}/{street-slug}/{id}.
 * Cards show street without house number → listing-unique dedupe keys.
 * Tests parse fixtures/huurstunt/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.huurstunt.nl';
const LIST_URL = `${BASE_URL}/huren/delft/0-1500`;

const TYPE_SEGMENTS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  woning: 'house',
  huis: 'house',
};

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const href = $card.find('a[href*="/huren/in/"]').first().attr('href');
  if (!href) return null;

  // https://www.huurstunt.nl/appartement/huren/in/delft/jan-de-oudeweg/f5hD6
  const url = new URL(href, BASE_URL);
  const segments = url.pathname.split('/').filter(Boolean);
  const externalId = segments.at(-1) ?? href;
  const typeSegment = segments[0] ?? '';
  const citySegment = segments[3] ?? '';

  const street = cleanText($card.find('h3').first().text());
  if (!street) return null;

  // Facts are separate elements ("41 m2", "Onbekend", "2 kamers") — match
  // per element; concatenating the card text would glue digits together.
  let surfaceM2: number | null = null;
  let rooms: number | null = null;
  $card.find('li, span, div').each((_, el) => {
    const text = cleanText($(el).text());
    const surface = text.match(/^(\d+)\s*m2$/i);
    const kamers = text.match(/^(\d+)\s*kamers?$/i);
    if (surface) surfaceM2 ??= Number.parseInt(surface[1]!, 10);
    if (kamers) rooms ??= Number.parseInt(kamers[1]!, 10);
  });
  const priceEur = parseInteger(cleanText($card.text()).match(/€\s?[\d.,]+/)?.[0] ?? '');

  const image =
    $card.find('img[data-src]').first().attr('data-src') ??
    $card.find('img[src^="https://"]').first().attr('src') ??
    null;

  const city = citySegment ? citySegment.charAt(0).toUpperCase() + citySegment.slice(1) : null;

  return {
    source: 'huurstunt',
    externalId,
    url: url.toString(),
    addressRaw: `${street}, ${city ?? 'Delft'}`, // no house number on cards
    priceEur,
    surfaceM2,
    // Rooms are often "Onbekend" on the cards.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_SEGMENTS[typeSegment] ?? 'unknown',
    furnished: 'unknown',
    agency: null,
    imageUrl: image,
    city,
  };
}

/** Parse a huurstunt results page; keeps Delft only. Never fatal per card. */
export function parseHuurstuntHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('article').each((_, card) => {
    try {
      const listing = parseCard($, $(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[huurstunt] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const huurstunt: SourceAdapter = {
  name: 'huurstunt',
  intervalSec: 600, // aggregator, near-pure duplicates — poll relaxed
  async fetchLatest() {
    return parseHuurstuntHtml(await fetchHtml(LIST_URL));
  },
  // Cards show street only; the detail page's JSON-LD carries the postcode
  // (locality-filtered: the page also embeds teasers from other towns).
  async enrich(raw) {
    const postcode = extractJsonLdPostcode(await fetchHtml(raw.url), raw.city ?? 'Delft');
    return postcode ? { postcode } : null;
  },
};
