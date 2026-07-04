import { fetch } from 'undici';
import { z } from 'zod';
import { slug } from '../core/normalize.js';

/**
 * PDOK Locatieserver — the Dutch government's free, public geocoding API
 * (api.pdok.nl, no key needed). Used by enrich() of sources whose pages carry
 * a full street + house number but no postcode anywhere (buurtje: verified,
 * the detail page only has lat/lng and the JSON-LD address is the company HQ).
 * One lookup per NEW listing; this is what the service is for — not scraping.
 */

const PDOK_URL = 'https://api.pdok.nl/bzk/locatieserver/search/v3_1/free';

const pdokResponseSchema = z.object({
  response: z.object({
    docs: z.array(
      z.object({
        type: z.string(),
        woonplaatsnaam: z.string().optional(),
        postcode: z.string().optional(),
        straatnaam: z.string().optional(),
      }),
    ),
  }),
});

/**
 * Postcode from a PDOK response — only when the best match really is the
 * requested street + city. A fuzzy geocoder hit for a different street must
 * never assign a postcode: a wrong district would wrongly filter a listing
 * OUT, which is worse than no postcode (over-send, never drop).
 */
export function parsePdokPostcode(body: string, street: string, city: string): string | null {
  let docs;
  try {
    docs = pdokResponseSchema.parse(JSON.parse(body)).response.docs;
  } catch {
    return null;
  }
  const doc = docs[0];
  if (!doc?.postcode) return null;
  if (slug(doc.woonplaatsnaam ?? '') !== slug(city)) return null;
  if (slug(doc.straatnaam ?? '') !== slug(street)) return null;
  const match = doc.postcode.match(/^(\d{4})\s?([A-Za-z]{2})$/);
  return match ? `${match[1]} ${match[2]!.toUpperCase()}` : null;
}

/** Resolve street + house number + city to a "2624 BC" postcode, or null. */
export async function lookupPostcode(
  street: string,
  houseNo: string,
  city: string,
): Promise<string | null> {
  const q = encodeURIComponent(`${street} ${houseNo} ${city}`);
  const url = `${PDOK_URL}?q=${q}&rows=1&fq=type:adres&fl=postcode,straatnaam,huisnummer,woonplaatsnaam,type`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) return null;
  return parsePdokPostcode(await res.text(), street, city);
}
