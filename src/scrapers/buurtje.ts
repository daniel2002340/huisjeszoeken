import { parseAddress } from '../core/normalize.js';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { lookupPostcode } from './pdok.js';

/**
 * Buurtje.nl — SOURCES.md #14. The /kaart/ page is a JS map; the data comes
 * from its GeoJSON endpoint api.buurtje.nl/api/wordpress/map-woningen.php
 * (found in the page's fetch calls), queried with the Delft bounding box and
 * huurkoop=huur. The endpoint requires browser-style Referer/CORS headers.
 * Features carry full street + house number → semantic dedupe keys, plus a
 * feed timestamp (dt) used to sort newest-first. The "br" field is NOT a
 * bedroom count (a 29 m² studio has br=3) and is deliberately ignored.
 * Tests parse fixtures/buurtje/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://buurtje.nl';
const API_URL =
  'https://api.buurtje.nl/api/wordpress/map-woningen.php' +
  '?sw_lat=51.9665&sw_lng=4.31951&ne_lat=52.0326&ne_lng=4.40789&huurkoop=huur';

const API_HEADERS = {
  Referer: 'https://buurtje.nl/',
  Origin: 'https://buurtje.nl',
  'Sec-Fetch-Site': 'same-site',
  'Sec-Fetch-Mode': 'cors',
  'Sec-Fetch-Dest': 'empty',
  Accept: 'application/json, */*',
};

const TYPE_MAP: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  tussenwoning: 'house',
  hoekwoning: 'house',
  eengezinswoning: 'house',
  woonhuis: 'house',
  huis: 'house',
};

interface BuurtjeProps {
  str?: string; // street
  nr?: string; // house number
  wp?: string; // city (woonplaats)
  pr?: number; // price
  op?: number; // surface (oppervlakte)
  uk?: string; // unique key
  st?: string; // status
  mk?: string; // agency (makelaar)
  dt?: string; // feed timestamp
  wt?: string; // type (woningtype)
  sl?: string; // site slug
  img?: string;
}

function toRawListing(props: BuurtjeProps): RawListing | null {
  if (!props.uk) return null;
  const street = (props.str ?? '').trim();
  // The API serializes an unknown house number as the literal string "NAN"
  // (~half the features) — treat anything without a digit as absent.
  const rawNr = (props.nr ?? '').trim();
  const nr = /\d/.test(rawNr) ? rawNr : '';

  return {
    source: 'buurtje',
    externalId: props.uk,
    url: props.sl ? new URL(props.sl, BASE_URL).toString() : `${BASE_URL}/kaart/?gwb=GM0503&type=huur`,
    addressRaw: `${[street, nr].filter(Boolean).join(' ') || 'Onbekend adres'}, ${props.wp ?? 'Delft'}`,
    priceEur: typeof props.pr === 'number' && props.pr > 0 ? Math.round(props.pr) : null,
    surfaceM2: typeof props.op === 'number' && props.op > 0 ? Math.round(props.op) : null,
    bedrooms: null, // "br" field semantics are unclear — do not guess
    propertyType: TYPE_MAP[(props.wt ?? '').toLowerCase()] ?? 'unknown',
    furnished: 'unknown',
    agency: props.mk || null,
    imageUrl: props.img || null,
    city: props.wp ?? null,
  };
}

/** Parse the GeoJSON: available Delft rentals, newest first. Never throws. */
export function parseBuurtjeJson(body: string): RawListing[] {
  let features: Array<{ properties?: BuurtjeProps }>;
  try {
    const data = JSON.parse(body) as { features?: Array<{ properties?: BuurtjeProps }> };
    features = data.features ?? [];
  } catch (error) {
    console.warn('[buurtje] response is not valid JSON:', error);
    return [];
  }

  return features
    .map((f) => f.properties)
    .filter((p): p is BuurtjeProps => p !== undefined)
    .filter(
      (p) =>
        (p.wp ?? '').toLowerCase() === 'delft' &&
        !/verhuurd|verkocht/i.test(p.st ?? ''), // drop gone listings, keep the rest
    )
    .sort((a, b) => (b.dt ?? '').localeCompare(a.dt ?? ''))
    .map((p) => {
      try {
        return toRawListing(p);
      } catch (error) {
        console.warn('[buurtje] skipping unparseable feature:', error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}

export const buurtje: SourceAdapter = {
  name: 'buurtje',
  intervalSec: 180,
  async fetchLatest() {
    return parseBuurtjeJson(await fetchHtml(API_URL, API_HEADERS));
  },
  // Cards have full street + house number but NO postcode, and the detail
  // page has none either (only lat/lng; its JSON-LD address is the company
  // HQ in Dalfsen). PDOK resolves the address to a postcode instead.
  async enrich(raw) {
    const { street, houseNo } = parseAddress(raw.addressRaw);
    if (!street || !houseNo) return null;
    const postcode = await lookupPostcode(street, houseNo, raw.city ?? 'Delft');
    return postcode ? { postcode } : null;
  },
};
