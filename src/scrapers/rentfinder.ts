import * as cheerio from 'cheerio';
import type { Furnished, PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Rentfinder.nl — SOURCES.md #8. Inertia.js app: the page body is empty and
 * all listing data ships as JSON in the #app data-page attribute. Verified
 * during build: the newest listings (highest ids) are on page 1, and the
 * SOURCES.md type=Appartement filter is dropped on purpose — "Kamer / Studio"
 * and "Huurwoning" are separate type values that the filter would exclude.
 * Tests parse fixtures/rentfinder/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://rentfinder.nl';
const LIST_URL = `${BASE_URL}/properties?page=1&place=Delft`;

const DELIVERY_MAP: Record<string, Furnished> = {
  kaal: 'shell',
  gestoffeerd: 'unfurnished',
  gemeubileerd: 'furnished',
};

interface RentfinderProperty {
  id?: number;
  slug?: string;
  title?: string;
  price?: number | string;
  place?: string;
  street?: string;
  type?: string;
  thumbnail?: string;
  property_details?: {
    bed_rooms?: number | string | null;
    living_area?: number | string | null;
    delivery?: string | null;
  } | null;
}

function typeOf(property: RentfinderProperty): PropertyType {
  switch (property.type) {
    case 'Appartement':
      return 'apartment';
    case 'Huurwoning':
      return 'house';
    case 'Kamer / Studio':
      // Combined type value; the title usually disambiguates.
      return /\bstudio\b/i.test(property.title ?? '') ? 'studio' : 'room';
    default:
      return 'unknown';
  }
}

// Numeric fields arrive as strings ("850") or numbers depending on the field.
const asInt = (v: unknown): number | null => {
  const n =
    typeof v === 'string' ? Number.parseInt(v, 10) : typeof v === 'number' ? Math.round(v) : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

function toRawListing(property: RentfinderProperty): RawListing | null {
  if (!property.id || !property.slug) return null;
  const details = property.property_details ?? {};

  return {
    source: 'rentfinder',
    externalId: String(property.id),
    url: `${BASE_URL}/properties/${property.slug}`,
    addressRaw: `${property.street ?? property.slug}, ${property.place ?? 'Delft'}`,
    priceEur: asInt(property.price),
    surfaceM2: asInt(details.living_area),
    bedrooms: asInt(details.bed_rooms), // real bedroom count
    propertyType: typeOf(property),
    furnished: DELIVERY_MAP[(details.delivery ?? '').toLowerCase()] ?? 'unknown',
    agency: null,
    imageUrl: property.thumbnail ?? null,
    city: property.place ?? null,
  };
}

/** Parse a Rentfinder page via its Inertia data-page payload. Never throws. */
export function parseRentfinderHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const payload = $('[data-page]').first().attr('data-page');
  if (!payload) {
    console.warn('[rentfinder] no Inertia data-page payload found');
    return [];
  }

  let properties: RentfinderProperty[];
  try {
    const data = JSON.parse(payload) as {
      props?: { properties?: { data?: RentfinderProperty[] } };
    };
    properties = data.props?.properties?.data ?? [];
  } catch (error) {
    console.warn('[rentfinder] data-page is not valid JSON:', error);
    return [];
  }

  return properties
    .filter((property) => (property.place ?? '').toLowerCase() === 'delft')
    .map((property) => {
      try {
        return toRawListing(property);
      } catch (error) {
        console.warn('[rentfinder] skipping unparseable property:', error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}

export const rentfinder: SourceAdapter = {
  name: 'rentfinder',
  intervalSec: 180,
  async fetchLatest() {
    return parseRentfinderHtml(await fetchHtml(LIST_URL));
  },
};
