import * as cheerio from 'cheerio';
import type { PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';
import { cleanText, parseInteger, type Selection } from './listing-card.js';

/**
 * DirectWonen.nl — SOURCES.md #20. Server-rendered; the Delft page shows the
 * inventory without pagination. Platform with partly paid access: most card
 * footers link directly to the detail page, some route via a premium-payment
 * URL that carries the real detail link in its returnUrl parameter — the
 * adapter unwraps it. Streets are abbreviated without house number
 * ("M. Nijhofflaan") → listing-unique dedupe keys via normalize.
 * Tests parse fixtures/directwonen/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://directwonen.nl';
const LIST_URL = `${BASE_URL}/huurwoningen-huren/delft`;

const TYPE_WORDS: Record<string, PropertyType> = {
  appartement: 'apartment',
  studio: 'studio',
  kamer: 'room',
  woning: 'house',
  huis: 'house',
};

/** Footer link, unwrapped when it routes via the premium-payment page. */
function detailUrl(href: string): string | null {
  try {
    const url = new URL(href, BASE_URL);
    if (url.pathname.includes('premiumaccountpayment')) {
      const wrapped = url.searchParams.get('returnUrl');
      return wrapped ? new URL(wrapped, BASE_URL).toString() : null;
    }
    return url.toString();
  } catch {
    return null;
  }
}

function parseCard($card: Selection): RawListing | null {
  const href = $card.find('.advertise-footer a').first().attr('href');
  const url = href ? detailUrl(href) : null;
  if (!url) return null;

  // .../delft/martinus-nijhofflaan/appartement-517258 -> 517258
  const externalId = url.match(/-(\d+)\/?$/)?.[1];
  if (!externalId) return null;

  const typeWord = cleanText($card.find('.advert-location-header').first().text()).toLowerCase();

  // "M. Nijhofflaan, Delft" (abbreviated street, no house number).
  const addressText = cleanText($card.find('h3.location-text').first().text());
  const [street = '', city = ''] = addressText.split(',').map((part) => part.trim());

  const rooms = parseInteger(
    cleanText($card.find('.small-banner.rooms .small-banner-top').first().text()),
  );

  return {
    source: 'directwonen',
    externalId,
    url,
    addressRaw: `${street || addressText}, ${city || 'Delft'}`,
    priceEur: parseInteger(cleanText($card.find('.advert-location-price').first().text())),
    surfaceM2: parseInteger(
      cleanText($card.find('.small-banner.surface .small-banner-top').first().text()),
    ),
    // Total rooms ("2 kmr"); Dutch convention counts the living room.
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    propertyType: TYPE_WORDS[typeWord] ?? 'unknown',
    furnished: 'unknown', // Opleverniveau is usually empty on the cards
    agency: null,
    imageUrl: $card.find('.advert-thumbnail img').first().attr('src') ?? null,
    city: city || null,
  };
}

/** Parse a DirectWonen results page; keeps Delft only. Never fatal per card. */
export function parseDirectwonenHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const listings: RawListing[] = [];

  $('.new-search-advert').each((_, card) => {
    try {
      const listing = parseCard($(card));
      if (listing && listing.city?.toLowerCase() === 'delft') listings.push(listing);
    } catch (error) {
      console.warn('[directwonen] skipping unparseable card:', error);
    }
  });

  return listings;
}

export const directwonen: SourceAdapter = {
  name: 'directwonen',
  intervalSec: 180,
  async fetchLatest() {
    return parseDirectwonenHtml(await fetchHtml(LIST_URL));
  },
};
