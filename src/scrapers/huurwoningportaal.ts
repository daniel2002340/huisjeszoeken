import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Huurwoningportaal.nl — SOURCES.md #7. group_ids=2650 is the Delft selection
 * (verified: every card in the capture is Delft) and sort=updated_at is the
 * site's "Nieuwste" option (taken from its own sort dropdown; the SOURCES.md
 * URL had sort=popularity, useless for new-listing detection). Cards show
 * street without house number → listing-unique dedupe keys via normalize.
 * Tests parse fixtures/huurwoningportaal/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://huurwoningportaal.nl';
const LIST_URL =
  `${BASE_URL}/huurwoningen/?view=1` +
  '&property_search%5Bgroup_ids%5D=2650' +
  '&property_search%5Bproperty_type%5D%5B%5D=1' +
  '&property_search%5Bproperty_type%5D%5B%5D=3' +
  '&property_search%5Bproperty_type%5D%5B%5D=6' +
  '&property_search%5Bmax_rate%5D=1500' +
  '&property_search%5Bsort%5D=updated_at';

const TYPE_WORDS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  huis: 'house',
  woonhuis: 'house',
  woning: 'house',
};

function parseCard($card: Selection): RawListing | null {
  const href = $card.attr('href');
  const externalId = $card.attr('data-id');
  if (!href || !externalId) return null;

  // Title block: "Appartement|2 kamers op 47 m²" (no whitespace around the
  // "|" divider). ".location-title" is actually the rooms/surface line; the
  // street lives in ".location" with ".zip-code-name" (city) nested inside.
  const title = cleanText($card.find('.title').first().text());
  const typeWord = title.match(/^[a-zà-ÿ]+/i)?.[0]?.toLowerCase() ?? '';
  const roomsLine = cleanText($card.find('.location-title').first().text());
  const rooms = roomsLine.match(/(\d+)\s*kamers?/i)?.[1];
  const surface = roomsLine.match(/op\s*(\d+)\s*m/i)?.[1];

  const locationText = cleanText($card.find('.location').first().text());
  const street = (locationText.split(',')[0] ?? '').trim();
  const city = cleanText($card.find('.zip-code-name').first().text()) || null;

  const imageSrc =
    $card.find('.img-wrapper img[src^="http"]').first().attr('src') ??
    $card
      .find('.img-wrapper source')
      .first()
      .attr('srcset')
      ?.split(',')[0]
      ?.trim()
      .split(/\s+/)[0] ??
    null;

  return {
    source: 'huurwoningportaal',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: `${street}${city ? `, ${city}` : ''}`, // no house number on cards
    priceEur: parseInteger(cleanText($card.find('.price-amount').first().text())),
    surfaceM2: surface ? Number.parseInt(surface, 10) : null,
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms ? Math.max(Number.parseInt(rooms, 10) - 1, 0) : null,
    propertyType: TYPE_WORDS[typeWord] ?? 'unknown',
    furnished: 'unknown', // not on the cards
    agency: null,
    imageUrl: imageSrc,
    city,
  };
}

/** Parse a huurwoningportaal.nl results page. Never fatal per card. */
export function parseHuurwoningportaalHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('a.property-component-card').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[huurwoningportaal] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const huurwoningportaal: SourceAdapter = {
  name: 'huurwoningportaal',
  intervalSec: 180,
  async fetchLatest() {
    return parseHuurwoningportaalHtml(await fetchHtml(LIST_URL));
  },
};
