import { rawListingSchema, type Listing, type RawListing } from './types.js';

/**
 * Width of the price bucket used in the cross-source dedupe key (PLAN.md §2):
 * dedupe_key = slug(street) + house_no + round(price/25).
 */
export const PRICE_BUCKET_EUR = 25;

/** Lowercase, strip diacritics, drop everything that is not a-z0-9. */
export function slug(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '');
}

export interface ParsedAddress {
  street: string | null;
  houseNo: string | null;
  postcode: string | null;
  city: string | null;
}

const POSTCODE_RE = /\b(\d{4})\s?([A-Z]{2})\b/i;
// Street name followed by a house number (optionally with a suffix like "12-A" or "12a").
const STREET_HOUSE_RE = /^(.+?)\s+(\d+(?:\s?[-/]?\s?[a-zA-Z0-9]{1,4})?)\s*$/;

/**
 * Parse a raw Dutch address line such as:
 *   "Voorstraat 12", "Voorstraat 12-A", "Voorstraat 12, 2611 JK Delft".
 * Best-effort: unparseable parts stay null (unknown must never drop a listing).
 */
export function parseAddress(addressRaw: string): ParsedAddress {
  let rest = addressRaw.trim();
  let postcode: string | null = null;
  let city: string | null = null;

  const pcMatch = rest.match(POSTCODE_RE);
  if (pcMatch) {
    postcode = `${pcMatch[1]} ${pcMatch[2]!.toUpperCase()}`;
    const after = rest.slice(pcMatch.index! + pcMatch[0].length).replace(/^[\s,]+/, '');
    if (after) city = after.trim();
    rest = rest.slice(0, pcMatch.index).replace(/[\s,]+$/, '');
  } else {
    // "Voorstraat 12, Delft" — treat a trailing comma part without digits as the city.
    const parts = rest.split(',').map((p) => p.trim());
    if (parts.length > 1 && parts.at(-1) && !/\d/.test(parts.at(-1)!)) {
      city = parts.pop()!;
      rest = parts.join(', ');
    }
  }

  const shMatch = rest.match(STREET_HOUSE_RE);
  if (!shMatch) {
    return { street: rest || null, houseNo: null, postcode, city };
  }
  return {
    street: shMatch[1]!.trim(),
    houseNo: slug(shMatch[2]!) || null,
    postcode,
    city,
  };
}

/** Cross-source dedupe key per PLAN.md §2: slug(street) + house_no + round(price/25). */
export function buildDedupeKey(
  street: string | null,
  houseNo: string | null,
  priceEur: number | null,
  source: string,
  externalId: string,
): string {
  if (street && houseNo) {
    const bucket = priceEur === null ? 'x' : String(Math.round(priceEur / PRICE_BUCKET_EUR));
    return `${slug(street)}-${houseNo}-${bucket}`;
  }
  // Without a parseable street + house number there is no safe cross-source
  // identity: a shared key (street-only, or title-based) would silently
  // swallow DISTINCT listings that happen to share street/type and price
  // bucket (e.g. identical new-build units). Give those a listing-unique key
  // instead — a duplicate alert beats a missed house (PLAN.md §2).
  return `u-${slug(source)}-${slug(externalId)}`;
}

/** Validate scraped input and normalize it into a Listing ready for dedupe + insert. */
export function normalize(raw: RawListing): Listing {
  const validated = rawListingSchema.parse(raw);
  const parsed = parseAddress(validated.addressRaw);

  return {
    source: validated.source,
    externalId: validated.externalId,
    url: validated.url,
    addressRaw: validated.addressRaw,
    street: parsed.street,
    houseNo: parsed.houseNo,
    postcode: parsed.postcode,
    city: validated.city ?? parsed.city ?? null,
    priceEur: validated.priceEur,
    surfaceM2: validated.surfaceM2 ?? null,
    bedrooms: validated.bedrooms ?? null,
    propertyType: validated.propertyType ?? 'unknown',
    furnished: validated.furnished ?? 'unknown',
    agency: validated.agency ?? null,
    imageUrl: validated.imageUrl ?? null,
    dedupeKey: buildDedupeKey(
      parsed.street,
      parsed.houseNo,
      validated.priceEur,
      validated.source,
      validated.externalId,
    ),
  };
}
