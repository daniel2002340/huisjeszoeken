import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * Rent.nl — SOURCES.md #19. An alert-service aggregator ("250+ sites"): the
 * ORIGINAL source per card is blurred and the only link is their signup page
 * (/aanmelden/?id=...), so alerts from this source carry card info + that
 * link. Value: early signal that something new exists at street X for €Y.
 * Cards are sorted "nieuw ➡️ oud" by default (stated on the page), the
 * property type hides in an HTML comment after each card, and there is no
 * house number → listing-unique dedupe keys via normalize. The original
 * min_surface URL param is silently ignored by the site (real name:
 * surface=) — dropped; the matcher filters per profile.
 * Tests parse fixtures/rent/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.rent.nl';
const LIST_URL = `${BASE_URL}/huurwoning/zuid-holland/delft/?min_price=0&max_price=1500`;

// <!-- // kamer --> after each card.
const TYPE_COMMENTS: Record<string, PropertyType> = {
  kamer: 'room',
  studio: 'studio',
  appartement: 'apartment',
  huurwoning: 'house',
  woning: 'house',
};

/** First HTML comment after the element (skipping whitespace text nodes). */
function trailingComment(card: unknown): string | null {
  let node = (card as { next?: unknown }).next as
    | { type?: string; data?: string; next?: unknown }
    | undefined;
  while (node) {
    if (node.type === 'comment') return node.data?.trim() ?? null;
    if (node.type === 'tag') return null;
    node = node.next as typeof node;
  }
  return null;
}

function parseCard($card: Selection, comment: string | null): RawListing | null {
  const externalId = $card.attr('id');
  if (!externalId || !/^\d+$/.test(externalId)) return null;

  // "Rochussenstraat,<br/>Delft" -> "Rochussenstraat, Delft"
  const addressText = cleanText($card.find('p.font-bold').first().text());
  const [street = '', city = ''] = addressText.split(',').map((part) => part.trim());
  if (!street) return null;

  // The card contains exactly one € amount ("€ 690 p/m").
  const priceEur = parseInteger($card.text().match(/€\s*[\d.,]+/)?.[0] ?? '');

  const typeWord = comment?.replace(/[^a-z]/gi, '').toLowerCase() ?? '';

  return {
    source: 'rent',
    externalId,
    url: `${BASE_URL}/aanmelden/?id=${externalId}`, // details are signup-gated
    addressRaw: `${street}, ${city || 'Delft'}`,
    priceEur,
    surfaceM2: parseInteger($card.text().match(/(\d+)\s*m²/)?.[1] ?? ''),
    bedrooms: null, // not on the cards
    propertyType: TYPE_COMMENTS[typeWord] ?? 'unknown',
    furnished: 'unknown',
    agency: null, // deliberately blurred by the site
    imageUrl: $card.find('img[src^="https://"]').first().attr('src') ?? null,
    city: city || null,
  };
}

/** Parse a rent.nl results page; keeps Delft only. Never fatal per card. */
export function parseRentHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('div[id].group').each((_, card) => {
    try {
      const listing = parseCard($(card), trailingComment(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[rent] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const rent: SourceAdapter = {
  name: 'rent',
  intervalSec: 180,
  async fetchLatest() {
    return parseRentHtml(await fetchHtml(LIST_URL));
  },
};
