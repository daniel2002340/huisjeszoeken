import * as cheerio from 'cheerio';
import type { CheerioAPI } from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Rentola.nl — SOURCES.md #13, aggregator with partly paywalled details.
 * Next.js (RSC) page, but the cards are fully server-rendered: title with
 * REAL bedroom counts ("1-slaapkamer appartement van 36 m²") and a complete
 * address line ("Jan de Oudeweg 332, 2628 SJ Delft, Netherlands") → semantic
 * cross-source dedupe keys. The original source's link is not on the cards
 * (only hinted at in image proxy URLs), so alerts link to rentola's own
 * listing page. All-types /huren/delft path (the SOURCES.md appartement-only
 * URL would drop studios and kamers).
 * Tests parse fixtures/rentola/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://rentola.nl';
const LIST_URL = `${BASE_URL}/huren/delft`;

function typeFromTitle(title: string): PropertyType {
  if (/appartement/i.test(title)) return 'apartment';
  if (/\bstudio\b/i.test(title)) return 'studio';
  if (/\bkamer\b/i.test(title)) return 'room';
  if (/woning|huis/i.test(title)) return 'house';
  return 'unknown';
}

const ADDRESS_RE = /^(.*?),\s*(\d{4})\s?([A-Z]{2})\s+([^,]+?)(?:,\s*Netherlands)?$/;

function parseCard($: CheerioAPI, $card: Selection): RawListing | null {
  const href = $card.find('a[href^="/listings/"]').first().attr('href');
  if (!href) return null;
  // /listings/appartement-jan-de-oudeweg-260-2628-sj-delft-p541361 -> p541361
  const externalId = href.split('-').at(-1) ?? href;

  // p elements: title first, address line second.
  const texts = $card
    .find('p')
    .toArray()
    .map((el) => cleanText($(el).text()))
    .filter(Boolean);
  const title = texts.find((t) => /m²|slaapkamer|appartement|studio|kamer|woning/i.test(t)) ?? '';
  const addressLine = texts.find((t) => /\d{4}\s?[A-Z]{2}/.test(t)) ?? '';

  const address = addressLine.match(ADDRESS_RE);
  const street = address?.[1]?.trim() ?? null;
  const postcode = address ? `${address[2]} ${address[3]}` : null;
  const city = address?.[4]?.trim() ?? null;

  const bedrooms = title.match(/(\d+)-slaapkamer/i)?.[1];
  const surface = title.match(/van\s+(\d+(?:[.,]\d+)?)\s*m²/i)?.[1];
  const priceEur = parseInteger(cleanText($card.text()).match(/€\s?[\d.,]+\s*\/\s*maand/)?.[0] ?? '');

  return {
    source: 'rentola',
    externalId,
    url: new URL(href, BASE_URL).toString(),
    addressRaw: street
      ? `${street}, ${postcode ? `${postcode} ` : ''}${city ?? 'Delft'}`
      : addressLine || title,
    priceEur,
    surfaceM2: surface ? Math.round(Number.parseFloat(surface.replace(',', '.'))) : null,
    bedrooms: bedrooms ? Number.parseInt(bedrooms, 10) : null, // real bedrooms
    propertyType: typeFromTitle(title),
    furnished: 'unknown',
    agency: null,
    imageUrl: $card.find('img[src^="https://"]').first().attr('src') ?? null,
    city,
  };
}

/** Parse a rentola results page; keeps Delft only. Never fatal per card. */
export function parseRentolaHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];
  const seen = new Set<string>();

  $('a[href^="/listings/"]').each((_, anchor) => {
    const href = $(anchor).attr('href');
    if (!href || seen.has(href)) return;
    seen.add(href);
    try {
      const $card = $(anchor).closest('div');
      const listing = parseCard($, $card.length ? $card : $(anchor));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[rentola] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const rentola: SourceAdapter = {
  name: 'rentola',
  intervalSec: 600, // aggregator, near-pure duplicates — poll relaxed
  async fetchLatest() {
    return parseRentolaHtml(await fetchHtml(LIST_URL));
  },
};
