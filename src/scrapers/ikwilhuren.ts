import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * ikwilhuren.nu — SOURCES.md #6, the rental portal of property manager MVGM
 * (their own listings → potentially early). Server-rendered HTML. Verified
 * during build: ?sort=aanbodDESC IS honored on this path (order differs from
 * the default and puts newest first), so page-1-only polling works. The
 * results include a +10 km radius that GET params cannot shrink (the filter
 * form is POST+CSRF), so the adapter filters on city == Delft.
 * Tests parse fixtures/ikwilhuren/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://ikwilhuren.nu';
const LIST_URL = `${BASE_URL}/aanbod/delft?sort=aanbodDESC`;

const TYPE_WORDS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  huis: 'house',
  woonhuis: 'house',
  woning: 'house',
};

function parseCard($card: Selection): RawListing | null {
  const link = $card.find('a.stretched-link').first();
  const href = link.attr('href');
  if (!href) return null;

  // /object/den-haag-2511dk-355-turfhaven-70c50a23522c193f7439d9b4415007e1/
  const slug = href.replace(/\/+$/, '').split('/').at(-1) ?? '';
  const externalId = slug.split('-').at(-1) ?? slug;

  // "Appartement Turfhaven 355" -> type word + street + house number.
  const title = cleanText(link.text());
  const typeWord = title.split(' ')[0]?.toLowerCase() ?? '';
  const propertyType = TYPE_WORDS[typeWord] ?? 'unknown';
  const streetPart = typeWord in TYPE_WORDS ? title.slice(title.indexOf(' ') + 1) : title;

  // "2511DK Den Haag - 8Km." — the second card-body span (the first is the
  // title); the distance suffix is always present.
  const locationText = cleanText($card.find('.card-body > span').eq(1).text());
  const location = locationText.match(/^(\d{4})\s?([A-Z]{2})\s+(.+?)\s*-\s*\d+\s*Km/i);
  const postcode = location ? `${location[1]} ${location[2]!.toUpperCase()}` : null;
  const city = location ? cleanText(location[3]!) : null;

  const priceEur = parseInteger(cleanText($card.find('.dotted-spans .fw-bold').first().text()));
  const surfaceM2 = parseInteger(
    cleanText($card.find('.dotted-spans span').eq(1).text()),
  );

  const imageSrc = $card.find('.card-img-top img').first().attr('src');

  return {
    source: 'ikwilhuren',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: `${streetPart}, ${postcode ? `${postcode} ` : ''}${city ?? ''}`.replace(/,\s*$/, ''),
    priceEur,
    surfaceM2,
    bedrooms: null, // not on the cards
    propertyType,
    furnished: 'unknown', // not on the cards
    agency: 'MVGM',
    imageUrl: imageSrc ? new URL(imageSrc, BASE_URL).toString() : null,
    city,
  };
}

/** Parse an ikwilhuren.nu results page; keeps Delft only. Never fatal per card. */
export function parseIkwilhurenHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('.card-woning').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[ikwilhuren] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const ikwilhuren: SourceAdapter = {
  name: 'ikwilhuren',
  intervalSec: 180,
  async fetchLatest() {
    return parseIkwilhurenHtml(await fetchHtml(LIST_URL));
  },
};
