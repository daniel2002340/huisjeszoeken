import type { Furnished, PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Bjornd Makelaardij — SOURCES.md #17, local Delft agency (early source).
 * The /nl/huurwoningen page is an empty widget shell; the data comes from the
 * internal JSON endpoint /nl/realtime-listings/consumer (the widget's
 * data-url), which returns the agency's ENTIRE portfolio: sales + rentals,
 * rented + available, all cities. The adapter keeps available Delft rentals.
 * Tests parse fixtures/bjornd/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.bjornd.nl';
const LIST_URL = `${BASE_URL}/nl/realtime-listings/consumer`;

const TYPE_BY_MAIN_TYPE: Record<string, PropertyType> = {
  apartment: 'apartment',
  house: 'house',
  studio: 'studio',
  room: 'room',
};

interface BjorndObject {
  url?: string;
  address?: string;
  zipcode?: string;
  city?: string;
  rentalsPrice?: number;
  livingSurface?: number;
  bedrooms?: number;
  mainType?: string;
  status?: string;
  added?: number;
  photo?: string;
  isRentals?: boolean;
  isFurnished?: boolean;
  isDecorated?: boolean;
  isShell?: boolean;
}

const furnishedOf = (obj: BjorndObject): Furnished => {
  if (obj.isFurnished) return 'furnished';
  if (obj.isShell) return 'shell';
  if (obj.isDecorated) return 'unfurnished'; // gestoffeerd
  return 'unknown';
};

const asInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) && v > 0 ? Math.round(v) : null;

function toRawListing(obj: BjorndObject): RawListing | null {
  if (!obj.url || !obj.address) return null;
  // /nl/woningaanbod/details/de-vlouw-1-c-5/699557cfd4b7c17fed79a57a
  const externalId = obj.url.split('/').filter(Boolean).at(-1) ?? obj.url;

  return {
    source: 'bjornd',
    externalId,
    url: new URL(obj.url, BASE_URL).toString(),
    addressRaw: `${obj.address}, ${obj.zipcode ? `${obj.zipcode} ` : ''}${obj.city ?? 'Delft'}`,
    priceEur: asInt(obj.rentalsPrice),
    surfaceM2: asInt(obj.livingSurface),
    bedrooms: asInt(obj.bedrooms), // real bedroom count, no kamers heuristic
    propertyType: TYPE_BY_MAIN_TYPE[obj.mainType ?? ''] ?? 'unknown',
    furnished: furnishedOf(obj),
    agency: 'Bjornd Makelaardij',
    imageUrl: obj.photo ?? null,
    city: obj.city ?? null,
  };
}

/** Parse the consumer JSON: available Delft rentals, newest first. Never throws. */
export function parseBjorndJson(body: string): RawListing[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    console.warn('[bjornd] response is not valid JSON:', error);
    return [];
  }
  if (!Array.isArray(data)) return [];

  return (data as BjorndObject[])
    .filter(
      (obj) =>
        obj.isRentals === true &&
        obj.status !== 'Verhuurd' && // anything not rented counts (over-send)
        (obj.city ?? '').toLowerCase() === 'delft',
    )
    .sort((a, b) => (b.added ?? 0) - (a.added ?? 0))
    .map((obj) => {
      try {
        return toRawListing(obj);
      } catch (error) {
        console.warn('[bjornd] skipping unparseable object:', error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}

export const bjornd: SourceAdapter = {
  name: 'bjornd',
  intervalSec: 180,
  async fetchLatest() {
    return parseBjorndJson(await fetchHtml(LIST_URL));
  },
};
