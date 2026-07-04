import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtmlViaBrowser } from './browser-fetch.js';
import {
  cleanText,
  parseCardFeatures,
  parseCardImage,
  parseCardLocality,
  parseCardPrice,
  type Selection,
} from './listing-card.js';

/**
 * Pararius — https://www.pararius.nl/huurwoningen/delft. Server-rendered HTML,
 * cheerio (PLAN.md §3), but fetched via headed Chromium since Cloudflare
 * challenges every plain HTTP client (see browser-fetch.ts). Page 1 only,
 * Delft only. Tests parse fixtures/pararius/ — never live sites in CI
 * (CLAUDE.md).
 */

const BASE_URL = 'https://www.pararius.nl';
const LIST_URL = `${BASE_URL}/huurwoningen/delft`;

// First path segment of the listing URL, e.g. /appartement-te-huur/delft/<id>/<street>.
const TYPE_BY_URL_SEGMENT: Record<string, PropertyType> = {
  'appartement-te-huur': 'apartment',
  'studio-te-huur': 'studio',
  'kamer-te-huur': 'room',
  'huis-te-huur': 'house',
  'woonhuis-te-huur': 'house',
};

function parseCard($card: Selection): RawListing | null {
  const titleLink = $card.find('a.listing-search-item__link--title').first();
  const href = titleLink.attr('href');
  if (!href) return null;

  // href: /appartement-te-huur/delft/2e760d4e/vlamingstraat
  const segments = href.split('/').filter(Boolean);
  const externalId = segments[2] ?? href;
  const propertyType = TYPE_BY_URL_SEGMENT[segments[0] ?? ''] ?? 'unknown';

  // Title "Appartement Vlamingstraat 33" -> street + house number.
  const title = cleanText(titleLink.text());
  const streetPart = title.replace(/^(appartement|studio|kamer|huis|woonhuis)\s+/i, '');
  const locality = parseCardLocality($card);
  const addressRaw = locality ? `${streetPart}, ${locality}` : streetPart;

  const agency = cleanText($card.find('.listing-search-item__info a').first().text()) || null;
  const image = parseCardImage($card);

  return {
    source: 'pararius',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw,
    priceEur: parseCardPrice($card),
    ...parseCardFeatures($card),
    propertyType,
    agency,
    imageUrl: image ? new URL(image, BASE_URL).toString() : null,
  };
}

/** Parse a Pararius search results page. A single bad card is skipped, never fatal. */
export function parseParariusHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('li.search-list__item--listing section.listing-search-item').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[pararius] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const pararius: SourceAdapter = {
  name: 'pararius',
  intervalSec: 120,
  async fetchLatest() {
    return parseParariusHtml(await fetchHtmlViaBrowser(LIST_URL));
  },
};
