import * as cheerio from 'cheerio';
import type { Furnished, PropertyType, RawListing, SourceAdapter } from '../core/types.js';
import { fetchHtml } from './http.js';

/**
 * Marktplaats — SOURCES.md #22. Private landlords who advertise nowhere else,
 * but also MANY scams: notify.ts appends a fixed scam warning to every alert
 * from this source (SOURCE_WARNINGS). Next.js app: listings ship as JSON in
 * the #__NEXT_DATA__ script. The q/delft text search also matches sellers
 * from elsewhere, so the adapter keeps only titles mentioning Delft. Titles
 * carry no street address → listing-unique dedupe keys via normalize.
 * Heavy bot-detection is possible; plain fetch worked at build time — if it
 * stops, the scheduler's backoff handles it (accept the source may fail).
 * Tests parse fixtures/marktplaats/ — never live sites in CI (CLAUDE.md).
 */

const BASE_URL = 'https://www.marktplaats.nl';
const LIST_URL = `${BASE_URL}/l/huizen-en-kamers/huizen-te-huur/q/delft/?sortBy=SORT_INDEX&sortOrder=DECREASING`;

interface MpListing {
  itemId?: string;
  title?: string;
  description?: string;
  vipUrl?: string;
  reserved?: boolean;
  priceInfo?: { priceCents?: number; priceType?: string };
  imageUrls?: string[];
  sellerInformation?: { sellerName?: string };
  attributes?: Array<{ key?: string; value?: string }>;
}

function typeFromTitle(title: string): PropertyType {
  // Order matters: "Appartement ... 1 kamer(s)" contains "kamer".
  if (/appartement/i.test(title)) return 'apartment';
  if (/\bstudio\b/i.test(title)) return 'studio';
  if (/\bkamer\b/i.test(title)) return 'room';
  if (/woning|huis/i.test(title)) return 'house';
  return 'unknown';
}

function furnishedFrom(text: string): Furnished {
  // No trailing word boundary: Dutch inflects these ("gemeubileerde studio").
  const lower = text.toLowerCase();
  if (/ongemeubileerd/.test(lower)) return 'unfurnished';
  if (/gemeubileerd/.test(lower)) return 'furnished';
  if (/gestoffeerd/.test(lower)) return 'unfurnished';
  if (/\bkaal\b/.test(lower)) return 'shell';
  return 'unknown';
}

function toRawListing(item: MpListing): RawListing | null {
  if (!item.itemId || !item.vipUrl || !item.title) return null;

  const attrs = new Map(
    (item.attributes ?? []).map((a) => [a.key ?? '', a.value ?? '']),
  );
  const rooms = Number.parseInt(attrs.get('numberOfRooms') ?? '', 10);
  // livingArea attribute is not always set; the title often carries "40 m²".
  const surface = Number.parseInt(
    attrs.get('livingArea') ?? item.title.match(/(\d+)\s*m²/)?.[1] ?? '',
    10,
  );

  const cents = item.priceInfo?.priceCents ?? 0;
  const priceEur =
    item.priceInfo?.priceType === 'FIXED' && cents > 0 ? Math.round(cents / 100) : null;

  const image = item.imageUrls?.[0];

  return {
    source: 'marktplaats',
    externalId: item.itemId,
    url: new URL(item.vipUrl, BASE_URL).toString(),
    addressRaw: item.title, // private ads carry no street address
    priceEur,
    surfaceM2: Number.isFinite(surface) && surface > 0 ? surface : null,
    // numberOfRooms is kamers; Dutch convention counts the living room.
    bedrooms: Number.isFinite(rooms) && rooms > 0 ? Math.max(rooms - 1, 0) : null,
    propertyType: typeFromTitle(item.title),
    furnished: furnishedFrom(`${item.title} ${item.description ?? ''}`),
    agency: item.sellerInformation?.sellerName ?? null,
    imageUrl: image ? (image.startsWith('//') ? `https:${image}` : image) : null,
    city: 'Delft', // enforced by the title filter below
  };
}

/** Parse a Marktplaats search page via #__NEXT_DATA__. Never throws. */
export function parseMarktplaatsHtml(html: string): RawListing[] {
  const $ = cheerio.load(html);
  const payload = $('script#__NEXT_DATA__').first().html();
  if (!payload) {
    console.warn('[marktplaats] no __NEXT_DATA__ payload found (bot wall?)');
    return [];
  }

  let items: MpListing[];
  try {
    const data = JSON.parse(payload) as {
      props?: { pageProps?: { searchRequestAndResponse?: { listings?: MpListing[] } } };
    };
    items = data.props?.pageProps?.searchRequestAndResponse?.listings ?? [];
  } catch (error) {
    console.warn('[marktplaats] __NEXT_DATA__ is not valid JSON:', error);
    return [];
  }

  return items
    .filter((item) => /delft/i.test(item.title ?? '')) // q= matches seller text too
    .filter((item) => item.reserved !== true)
    .map((item) => {
      try {
        return toRawListing(item);
      } catch (error) {
        console.warn('[marktplaats] skipping unparseable listing:', error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}

export const marktplaats: SourceAdapter = {
  name: 'marktplaats',
  intervalSec: 180,
  async fetchLatest() {
    return parseMarktplaatsHtml(await fetchHtml(LIST_URL));
  },
};
