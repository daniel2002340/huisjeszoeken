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
 * Huurwoningen.nl — Delft city page sorted by newest, server-rendered HTML
 * fetched via headed Chromium — Cloudflare challenges every plain HTTP client
 * (see browser-fetch.ts).
 * Same card markup family as Pararius, but: listing URLs carry no property
 * type (/huren/delft/<id>/<street>/), the type is the first word of the card
 * title, cards show no agency and NO house number (detail page only). Tests
 * parse fixtures/huurwoningen/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.huurwoningen.nl';
const LIST_URL = `${BASE_URL}/in/delft/?ordering=newest`;

// First word of the card title, e.g. "Appartement Vlamingstraat".
// "Woningruil" (house swap) intentionally maps to 'unknown' -> over-send.
const TYPE_BY_TITLE_WORD: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  huis: 'house',
  woonhuis: 'house',
  woning: 'house',
};

function parseCard($card: Selection): RawListing | null {
  const titleLink = $card.find('a.listing-search-item__link--title').first();
  const href = titleLink.attr('href');
  if (!href) return null;

  // href: /huren/delft/3140f162/vlamingstraat/
  const segments = href.split('/').filter(Boolean);
  const externalId = segments[2] ?? href;

  // Title "Appartement Vlamingstraat" -> type word + street (no house number).
  const title = cleanText(titleLink.text());
  const typeWord = title.split(' ')[0]?.toLowerCase() ?? '';
  const propertyType = TYPE_BY_TITLE_WORD[typeWord] ?? 'unknown';
  const streetPart = typeWord in TYPE_BY_TITLE_WORD ? title.slice(title.indexOf(' ') + 1) : title;

  const locality = parseCardLocality($card);
  const addressRaw = locality ? `${streetPart}, ${locality}` : streetPart;
  const image = parseCardImage($card);

  return {
    source: 'huurwoningen',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw,
    priceEur: parseCardPrice($card),
    ...parseCardFeatures($card),
    propertyType,
    agency: null, // not shown on huurwoningen.nl index cards
    imageUrl: image ? new URL(image, BASE_URL).toString() : null,
  };
}

/** Parse a huurwoningen.nl search results page. A single bad card is skipped, never fatal. */
export function parseHuurwoningenHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('li.search-list__item--listing section.listing-search-item').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[huurwoningen] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const huurwoningen: SourceAdapter = {
  name: 'huurwoningen',
  intervalSec: 150,
  async fetchLatest() {
    return parseHuurwoningenHtml(await fetchHtmlViaBrowser(LIST_URL));
  },
};
