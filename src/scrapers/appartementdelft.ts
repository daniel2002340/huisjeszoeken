import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * AppartementDelft.nl — SOURCES.md #4. Small local Delft site (often listings
 * direct from owners), potentially the earliest source. Every card embeds a
 * schema.org ld+json blob with address/rooms/surface/images — preferred over
 * DOM classes; only the price and detail URL come from the card markup. The
 * index hides the house number in the JSON ("Jan Campertlaan 0") but the URL
 * slug carries the real one (jan-campertlaan-22).
 * Tests parse fixtures/appartementdelft/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.appartementdelft.nl';
const LIST_URL = `${BASE_URL}/`;

const TYPE_BY_SCHEMA_TYPE: Record<string, PropertyType> = {
  apartment: 'apartment',
  house: 'house',
  singlefamilyresidence: 'house',
  room: 'room',
};

interface CardJson {
  '@type'?: string;
  name?: string;
  address?: { streetAddress?: string; postalCode?: string; addressLocality?: string };
  image?: string[];
  numberOfRooms?: number;
  floorSize?: { value?: number };
}

function parseCard($card: Selection): RawListing | null {
  const url = $card.find('.listing-title a').first().attr('href');
  if (!url) return null;
  // https://www.appartementdelft.nl/roland-holstbuurt/jan-campertlaan-22
  const externalId = new URL(url, BASE_URL).pathname.replace(/^\/|\/$/g, '');
  if (!externalId) return null;

  let json: CardJson = {};
  try {
    json = JSON.parse($card.find('script[type="application/ld+json"]').first().html() ?? '{}');
  } catch {
    // fall through — card markup still carries url + price
  }

  // "Jan Campertlaan 0" — the index zeroes the house number; the URL slug has
  // the real one ("...-22" or "...-22a").
  const street = cleanText(json.address?.streetAddress ?? json.name ?? '').replace(/\s+0$/, '');
  const slugHouseNo = externalId.split('/').at(-1)?.match(/-(\d+[a-z]?)$/i)?.[1] ?? null;
  const postcode = json.address?.postalCode ?? null;
  const city = json.address?.addressLocality ?? 'Delft';
  const streetPart = street ? `${street}${slugHouseNo ? ` ${slugHouseNo}` : ''}` : externalId;
  const addressRaw = `${streetPart}, ${postcode ? `${postcode} ` : ''}${city}`;

  const rooms = typeof json.numberOfRooms === 'number' ? json.numberOfRooms : null;
  const schemaType = (json['@type'] ?? '').toLowerCase();

  return {
    source: 'appartementdelft',
    externalId,
    url: new URL(url, BASE_URL).toString(),
    addressRaw,
    priceEur: parseInteger(cleanText($card.find('.listing-price').first().text())),
    surfaceM2: typeof json.floorSize?.value === 'number' ? Math.round(json.floorSize.value) : null,
    // Total rooms; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_BY_SCHEMA_TYPE[schemaType] ?? 'unknown',
    furnished: 'unknown', // not on the index cards
    agency: null, // mostly direct-from-owner listings
    imageUrl: json.image?.[0] ?? null,
    city,
  };
}

/** Parse the appartementdelft.nl index page. A single bad card is never fatal. */
export function parseAppartementDelftHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('div.listing[data-number]').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[appartementdelft] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const appartementdelft: SourceAdapter = {
  name: 'appartementdelft',
  intervalSec: 180,
  async fetchLatest() {
    return parseAppartementDelftHtml(await fetchHtml(LIST_URL));
  },
};
