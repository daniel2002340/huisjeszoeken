import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Huislijn.nl — SOURCES.md #9. Vue app whose server-side results embed every
 * listing as a JSON blob in the :object attribute of hl-search-object-display
 * elements — parsed directly, no DOM scraping. No price filter in the URL;
 * the matcher handles per-profile bounds. An aggregator: its deeplink fields
 * point to the original sources (huurwoningen.nl etc.), so expect overlap.
 * Tests parse fixtures/huislijn/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.huislijn.nl';
const LIST_URL = `${BASE_URL}/huurwoning/nederland/zuid-holland/delft`;

const TYPE_MAP: Record<string, PropertyType> = {
  appartement: 'apartment',
  bovenwoning: 'house',
  benedenwoning: 'house',
  woonhuis: 'house',
  huis: 'house',
  studio: 'studio',
  kamer: 'room',
};

interface HuislijnObject {
  id?: number;
  type?: string;
  link?: string;
  street?: string;
  housenumber?: string;
  zipcode?: string;
  city?: string;
  price?: string;
  status?: string;
  photo?: { formats?: Record<string, string> };
  properties?: {
    WoonOpp?: number;
    HoofdType?: string;
    AantalSlaapkamers?: number | null;
  };
}

/** "2624BC" -> "2624 BC". */
const formatZip = (zip: string | undefined): string | null => {
  const match = zip?.match(/^(\d{4})\s?([A-Za-z]{2})$/);
  return match ? `${match[1]} ${match[2]!.toUpperCase()}` : null;
};

function toRawListing(obj: HuislijnObject): RawListing | null {
  if (!obj.id || !obj.link) return null;
  const props = obj.properties ?? {};

  const street = (obj.street ?? '').trim();
  const houseNo = (obj.housenumber ?? '').trim();
  const zip = formatZip(obj.zipcode);
  const city = obj.city ?? 'Delft';
  const streetPart = [street, houseNo].filter(Boolean).join(' ');
  const addressRaw = `${streetPart || obj.link}, ${zip ? `${zip} ` : ''}${city}`;

  const price = Number.parseFloat(obj.price ?? '');
  const bedrooms = props.AantalSlaapkamers;
  const surface = props.WoonOpp;

  return {
    source: 'huislijn',
    externalId: String(obj.id),
    url: new URL(obj.link, BASE_URL).toString(),
    addressRaw,
    priceEur: Number.isFinite(price) && price > 0 ? Math.round(price) : null,
    surfaceM2: typeof surface === 'number' && surface > 0 ? Math.round(surface) : null,
    bedrooms: typeof bedrooms === 'number' && bedrooms >= 0 ? bedrooms : null, // real bedrooms
    propertyType: TYPE_MAP[(props.HoofdType ?? '').toLowerCase()] ?? 'unknown',
    furnished: 'unknown', // not in the embedded objects
    agency: null,
    imageUrl: obj.photo?.formats?.['m'] ?? null,
    city,
  };
}

/** Parse the SSR :object JSON blobs. Skips rented objects. Never throws. */
export function parseHuislijnHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('hl-search-object-display').each((_, el) => {
    const raw = $(el).attr(':object');
    // The client-side template also has :object="object" — JSON blobs only.
    if (!raw || !raw.startsWith('{')) return;
    try {
      const obj = JSON.parse(raw) as HuislijnObject;
      if (obj.type !== 'rent') return;
      if (/verhuurd/i.test(obj.status ?? '')) return;
      if ((obj.city ?? '').toLowerCase() !== 'delft') return;
      const listing = toRawListing(obj);
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[huislijn] skipping unparseable object:', error);
    }
  });

  return listings;
}

export const huislijn: SourceAdapter = {
  name: 'huislijn',
  intervalSec: 180,
  async fetchLatest() {
    return parseHuislijnHtml(await fetchHtml(LIST_URL));
  },
};
