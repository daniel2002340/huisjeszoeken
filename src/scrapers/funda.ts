import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Funda huur — Delft, sorted newest (PLAN.md §3 phase 2).
 *
 * Data source: the internal JSON payload embedded in the SSR page
 * (#__NUXT_DATA__), preferred over DOM scraping per the plan. Notably, Funda
 * hard-blocks headless browsers (Playwright headless shell AND full headless
 * Chromium both get the "Je bent bijna op de pagina die je zoekt" bot page)
 * while serving plain HTTP requests normally — so this adapter uses the same
 * polite undici fetch as the other sources. See scripts/funda-explore.ts for
 * the diagnostic tool used to establish this.
 *
 * Tests parse fixtures/funda/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.funda.nl';
const LIST_URL = `${BASE_URL}/zoeken/huur?selected_area=%5B%22delft%22%5D&sort=%22date_down%22`;

const TYPE_BY_OBJECT_TYPE: Record<string, PropertyType> = {
  apartment: 'apartment',
  house: 'house',
  studio: 'studio',
  room: 'room',
};

/**
 * Nuxt 3 serializes its payload in "devalue" format: one flat JSON array in
 * which every object value / array item is an INDEX into that same array.
 * Resolve a node back into a plain JS value. Negative indices are devalue
 * sentinels (-1 = undefined, ...) -> null; cycles and absurd depth stop.
 */
function resolveNode(arr: unknown[], index: unknown, depth = 0, seen = new Set<number>()): unknown {
  if (typeof index !== 'number' || !Number.isInteger(index)) return null;
  if (index < 0 || index >= arr.length || depth > 15 || seen.has(index)) return null;
  const value = arr[index];
  if (Array.isArray(value)) {
    return value.map((item) => resolveNode(arr, item, depth + 1, new Set(seen).add(index)));
  }
  if (value !== null && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, idx] of Object.entries(value)) {
      out[key] = resolveNode(arr, idx, depth + 1, new Set(seen).add(index));
    }
    return out;
  }
  return value ?? null;
}

const asString = (v: unknown): string | null => (typeof v === 'string' && v !== '' ? v : null);
const asInt = (v: unknown): number | null =>
  typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null;
const firstOf = (v: unknown): unknown => (Array.isArray(v) ? v[0] : undefined);

/** "2611DX" -> "2611 DX" (matches how the other sources format postcodes). */
const formatPostcode = (raw: string | null): string | null => {
  const match = raw?.match(/^(\d{4})\s?([A-Za-z]{2})$/);
  return match ? `${match[1]} ${match[2]!.toUpperCase()}` : raw;
};

function toRawListing(node: Record<string, unknown>): RawListing | null {
  const relativeUrl = asString(node['object_detail_page_relative_url']);
  if (!relativeUrl) return null;

  // /detail/huur/delft/appartement-houttuinen-38-c/44413025/ -> 44413025
  const externalId = relativeUrl.match(/\/(\d+)\/?$/)?.[1] ?? String(node['id'] ?? relativeUrl);

  const address = (node['address'] ?? {}) as Record<string, unknown>;
  const street = asString(address['street_name']);
  const houseNo = [asString(address['house_number']), asString(address['house_number_suffix'])]
    .filter(Boolean)
    .join(' ');
  const postcode = formatPostcode(asString(address['postal_code']));
  const city = asString(address['city']) ?? 'Delft';
  const streetPart = street ? `${street}${houseNo ? ` ${houseNo}` : ''}` : null;
  const addressRaw = streetPart
    ? `${streetPart}, ${postcode ? `${postcode} ` : ''}${city}`
    : relativeUrl;

  const price = (node['price'] ?? {}) as Record<string, unknown>;
  const agent = firstOf(node['agent']) as Record<string, unknown> | undefined;
  const photoId = asString(firstOf(node['photo_image_id']));

  return {
    source: 'funda',
    externalId,
    url: new URL(relativeUrl, BASE_URL).toString(),
    addressRaw,
    priceEur: asInt(firstOf(price['rent_price'])),
    surfaceM2: asInt(firstOf(node['floor_area'])),
    bedrooms: asInt(node['number_of_bedrooms']),
    propertyType: TYPE_BY_OBJECT_TYPE[asString(node['object_type']) ?? ''] ?? 'unknown',
    furnished: 'unknown', // not present on Funda search cards
    agency: asString(agent?.['name']),
    imageUrl: photoId ? `https://cloud.funda.nl/${photoId}?options=width=700` : null,
  };
}

/**
 * Parse a Funda search page via its embedded #__NUXT_DATA__ payload. Listing
 * nodes are the dicts carrying both `address` and `price`. A single bad node
 * is skipped, never fatal; a page without a payload yields [].
 */
export function parseFundaHtml(html: string): RawListing[] {
  const payloadMatch = html.match(/<script[^>]*id="__NUXT_DATA__"[^>]*>(.*?)<\/script>/s);
  if (!payloadMatch) {
    console.warn('[funda] no __NUXT_DATA__ payload found in page');
    return [];
  }

  let arr: unknown[];
  try {
    const parsed: unknown = JSON.parse(payloadMatch[1]!);
    if (!Array.isArray(parsed)) return [];
    arr = parsed;
  } catch (error) {
    console.warn('[funda] __NUXT_DATA__ is not valid JSON:', error);
    return [];
  }

  const listings: RawListing[] = [];
  arr.forEach((value, index) => {
    if (
      value === null ||
      typeof value !== 'object' ||
      Array.isArray(value) ||
      !('address' in value) ||
      !('price' in value) ||
      !('object_detail_page_relative_url' in value)
    ) {
      return;
    }
    try {
      const node = resolveNode(arr, index) as Record<string, unknown>;
      const listing = toRawListing(node);
      if (listing) listings.push(listing);
    } catch (error) {
      console.warn('[funda] skipping unparseable listing node:', error);
    }
  });

  return listings;
}

export const funda: SourceAdapter = {
  name: 'funda',
  intervalSec: 180,
  async fetchLatest() {
    return parseFundaHtml(await fetchHtml(LIST_URL));
  },
};
