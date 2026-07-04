import type { PropertyType, RawListing } from '../core/types.js';

/**
 * Shared parser for ZIG/Hexia housing-corporation portals (SOURCES.md #15/#16:
 * woonnet-haaglanden, roommatch). These are registration/lottery systems, not
 * a speed game: alerts are informational only — notify.ts suppresses the
 * application letter for these sources (NO_LETTER_SOURCES). Data comes from
 * the portal's own JSON endpoint POST /portal/object/frontend/getallobjects/
 * format/json (empty body = full current offer).
 */

export const ZIG_ENDPOINT_PATH = '/portal/object/frontend/getallobjects/format/json';

const TYPE_MAP: Record<string, PropertyType> = {
  appartement: 'apartment',
  portiekflat: 'apartment',
  galerijflat: 'apartment',
  flat: 'apartment',
  studio: 'studio',
  kamer: 'room',
  benedenwoning: 'house',
  bovenwoning: 'house',
  eengezinswoning: 'house',
  tussenwoning: 'house',
  maisonnette: 'house',
};

interface ZigObject {
  id?: number | string;
  urlKey?: string;
  street?: string;
  houseNumber?: string;
  houseNumberAddition?: string;
  postalcode?: string;
  city?: { name?: string };
  totalRent?: number | string;
  usableFloorArea?: number | string | null;
  sleepingRoom?: { amountOfRooms?: string };
  dwellingType?: { localizedName?: string };
  publicationDate?: string;
  isGepubliceerd?: boolean;
  pictures?: Array<{ uri?: string }>;
}

const asNum = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number.parseFloat(v) : typeof v === 'number' ? v : NaN;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
};

export function parseZigJson(
  body: string,
  source: string,
  baseUrl: string,
  detailPath = '/aanbod/nu-te-huur/te-huur/details/',
): RawListing[] {
  let objects: ZigObject[];
  try {
    const data = JSON.parse(body) as { result?: ZigObject[] };
    objects = data.result ?? [];
  } catch (error) {
    console.warn(`[${source}] response is not valid JSON:`, error);
    return [];
  }

  return objects
    .filter((o) => (o.city?.name ?? '').toLowerCase() === 'delft' && o.isGepubliceerd !== false)
    .sort((a, b) => (b.publicationDate ?? '').localeCompare(a.publicationDate ?? ''))
    .map((o) => {
      try {
        if (!o.id || !o.urlKey) return null;
        const street = (o.street ?? '').trim();
        const nr = [o.houseNumber, o.houseNumberAddition].filter(Boolean).join(' ').trim();
        const picture = o.pictures?.[0]?.uri;
        const typeName = (o.dwellingType?.localizedName ?? '').toLowerCase();

        const listing: RawListing = {
          source,
          externalId: String(o.id),
          url: `${baseUrl}${detailPath}${o.urlKey}`,
          addressRaw: `${[street, nr].filter(Boolean).join(' ')}, ${o.postalcode ? `${o.postalcode} ` : ''}Delft`,
          priceEur: asNum(o.totalRent),
          surfaceM2: asNum(o.usableFloorArea),
          bedrooms: asNum(o.sleepingRoom?.amountOfRooms), // real sleeping rooms
          propertyType: TYPE_MAP[typeName] ?? 'unknown',
          furnished: 'unknown',
          agency: null, // housing corporations
          imageUrl: picture ? new URL(picture, baseUrl).toString() : null,
          city: 'Delft',
        };
        return listing;
      } catch (error) {
        console.warn(`[${source}] skipping unparseable object:`, error);
        return null;
      }
    })
    .filter((listing): listing is RawListing => listing !== null);
}
