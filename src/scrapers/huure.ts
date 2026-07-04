import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Huure.nl — SOURCES.md #3. Server-rendered HTML (no JSON endpoint needed);
 * sort=new and the Delft bounding box are in the URL. The bounding box leaks
 * neighbouring towns (Rijswijk, Den Hoorn, ...), so the adapter filters on
 * city == Delft. Cards show NO street address — only a 4-digit postcode
 * district — so listings get a listing-unique dedupe key via normalize.
 * Tests parse fixtures/huure/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://huure.nl';
const LIST_URL = `${BASE_URL}/huurwoning/delft?sw_lat=51.9665&sw_lng=4.31951&ne_lat=52.0326&ne_lng=4.40789&types=apartment_house&max_rent=1500&min_sqm_size=30&sort=new`;

const TYPE_BY_LABEL: Record<string, PropertyType> = {
  appartement: 'apartment',
  huis: 'house',
  woonhuis: 'house',
  studio: 'studio',
  kamer: 'room',
};

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const href = $card.find('a[href^="/huurwoningen/"]').first().attr('href');
  if (!href) return null;

  // /huurwoningen/2-kamer-appartement-in-delft-21123866 -> 21123866
  const externalId = href.match(/-(\d+)\/?$/)?.[1] ?? href;

  // "2 kamer appartement in Delft"
  const title = cleanText($card.find('a .visually-hidden').first().text());
  const city = title.match(/\bin\s+([A-Za-zÀ-ÿ' -]+)$/)?.[1]?.trim() ?? null;

  // Feature list: each dl > div holds a dt (hidden label) + dd (value).
  const features = new Map<string, string>();
  $card.find('dl > div').each((_, group) => {
    const $group = $(group);
    const label = cleanText($group.find('dt').text()).toLowerCase();
    const value = cleanText($group.find('dd').text());
    if (label) features.set(label, value);
  });

  const surfaceM2 = parseInteger(features.get('oppervlakte') ?? '');
  const typeLabel = (features.get('type eigendom') ?? '').toLowerCase();
  const rooms = parseInteger(features.get('kamers') ?? '');

  // "2624, Delft" (postcode district only — no street shown on the card).
  const district = cleanText($card.find('h3').first().text());
  const districtPc = district.match(/\d{4}/)?.[0] ?? null;
  const addressRaw = `${title}${districtPc ? ` (${districtPc})` : ''}, ${city ?? 'Delft'}`;

  return {
    source: 'huure',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw,
    // District-only, but enough for the matcher's postcode filter — the
    // "(2624)" embedded in addressRaw is not parseable as a postcode.
    postcode: districtPc,
    priceEur: parseInteger(cleanText($card.find('.property-price').first().text())),
    surfaceM2,
    // Total rooms shown; Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_BY_LABEL[typeLabel] ?? 'unknown',
    furnished: 'unknown', // not shown on huure.nl cards
    agency: null,
    imageUrl: $card.find('.property-image img').first().attr('src') ?? null,
    city,
  };
}

/** Parse a huure.nl results page; keeps Delft only. A bad card is never fatal. */
export function parseHuureHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('.property-item').each((_, card) => {
    try {
      const listing = parseCard($, $(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[huure] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const huure: SourceAdapter = {
  name: 'huure',
  intervalSec: 180,
  async fetchLatest() {
    return parseHuureHtml(await fetchHtml(LIST_URL));
  },
};
