import * as cheerio from 'cheerio';
import type { Furnished, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Oude Delft Makelaardij — SOURCES.md #18, local Delft agency (early source).
 * Listings are ordinary WordPress posts behind the standard WP REST API:
 * category 26 = available rentals ("Huurwoning Nederlands"); posts that get
 * rented ALSO receive category 11 ("Verhuurd NL") — those are skipped.
 * Details live in a free-form excerpt in mixed Dutch/English, e.g.:
 *   "1 bedroom – €1.372 incl. – unfurnished – Available from 01-07-2026"
 *   "Available 01-07-2026 | 1 slaapkamer – 30 m2 – €1.350,- incl. gemeubileerd"
 * Titles are street names without house numbers ("Kloksteeg B") — listings
 * get a listing-unique dedupe key via normalize.
 * Tests parse fixtures/oudedelft/ — never live sites in CI (CLAUDE.md).
 */

const LIST_URL = 'https://oudedelft.com/wp-json/wp/v2/posts?categories=26&per_page=20&_embed=1';
const RENTED_CATEGORY = 11;

interface WpPost {
  id?: number;
  link?: string;
  title?: { rendered?: string };
  excerpt?: { rendered?: string };
  categories?: number[];
  _embedded?: { 'wp:featuredmedia'?: Array<{ source_url?: string }> };
}

const htmlToText = (html: string): string =>
  cheerio.load(html).text().replace(/\s+/g, ' ').trim();

/**
 * Free-form prices: "€1.372", "€ 1.350,-", "€ 1,700", "€1353,25", bare
 * "1.700 excl.". Separators are used inconsistently as thousands AND decimal
 * marks, so normalize the whole numeric token.
 */
export function parseExcerptPrice(text: string): number | null {
  const euro = text.match(/€\s*([\d.,]+)/)?.[1];
  // Without a € sign only accept a separated-thousands amount ("1.700") —
  // plain number runs would false-match dates like 01-07-2026.
  const token = euro ?? text.match(/(?:^|\s)(\d{1,2}[.,]\d{3})(?=[\s,.])/)?.[1];
  if (!token) return null;
  const normalized = token
    .replace(/[.,]+$/, '') // trailing ",-" style noise
    .replace(/[.,](\d{2})$/, '') // decimal cents ("1353,25")
    .replace(/[.,]/g, ''); // thousands separators
  const value = Number.parseInt(normalized, 10);
  return Number.isFinite(value) && value > 0 ? value : null;
}

const furnishedOf = (text: string): Furnished => {
  const lower = text.toLowerCase();
  if (/unfurnished|ongemeubileerd|gestoffeerd/.test(lower)) return 'unfurnished';
  if (/furnished|gemeubileerd/.test(lower)) return 'furnished';
  if (/\bkaal\b|\bshell\b/.test(lower)) return 'shell';
  return 'unknown';
};

function toRawListing(post: WpPost): RawListing | null {
  if (!post.link || !post.id) return null;

  const title = htmlToText(post.title?.rendered ?? '');
  if (!title) return null;
  const excerpt = htmlToText(post.excerpt?.rendered ?? '');

  const bedrooms = excerpt.match(/(\d+)\s*(?:bedroom|slaapkamer)/i)?.[1];
  const surface = excerpt.match(/(\d+)\s*m2\b|(\d+)\s*m²/i);

  return {
    source: 'oudedelft',
    externalId: String(post.id),
    url: post.link,
    addressRaw: title, // street only, no house number/postcode on the index
    priceEur: parseExcerptPrice(excerpt),
    surfaceM2: surface ? Number.parseInt(surface[1] ?? surface[2] ?? '', 10) : null,
    bedrooms: bedrooms ? Number.parseInt(bedrooms, 10) : null,
    propertyType: 'unknown', // not stated on the index
    furnished: furnishedOf(excerpt),
    agency: 'Oude Delft Makelaardij',
    imageUrl: post._embedded?.['wp:featuredmedia']?.[0]?.source_url ?? null,
    city: null, // "Delft en omstreken" — not stated per post
  };
}

/** Parse the WP REST posts JSON; skips already-rented posts. Never throws. */
export function parseOudedelftJson(body: string): RawListing[] {
  let data: unknown;
  try {
    data = JSON.parse(body);
  } catch (error) {
    console.warn('[oudedelft] response is not valid JSON:', error);
    return [];
  }
  if (!Array.isArray(data)) return [];

  return (data as WpPost[])
    .filter((post) => !(post.categories ?? []).includes(RENTED_CATEGORY))
    // Rented is often only marked in the excerpt text, not the category.
    .filter((post) => !/verhuurd|rented\s*out/i.test(post.excerpt?.rendered ?? ''))
    .map((post) => {
      try {
        return toRawListing(post);
      } catch (error) {
        console.warn('[oudedelft] skipping unparseable post:', error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}

export const oudedelft: SourceAdapter = {
  name: 'oudedelft',
  intervalSec: 180,
  async fetchLatest() {
    return parseOudedelftJson(await fetchHtml(LIST_URL));
  },
};
