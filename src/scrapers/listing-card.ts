import type { CheerioAPI } from 'cheerio';
import type { Furnished } from '../core/types.js';

/**
 * Shared helpers for the Pararius-family listing-card markup (pararius.nl and
 * huurwoningen.nl are run by the same company and use near-identical HTML).
 * Adapters stay self-contained (PLAN.md §3): they own their URL, selectors for
 * ids/types, interval and fetch; these are just parsing utilities.
 */

export type Selection = ReturnType<CheerioAPI>;

export const cleanText = (value: string): string => value.replace(/\s+/g, ' ').trim();

/** "€ 2.750 per maand" -> 2750, "97 m²" -> 97. Handles NBSP and dot separators. */
export const parseInteger = (value: string): number | null => {
  const match = value.replace(/\./g, '').match(/\d+/);
  return match ? Number.parseInt(match[0], 10) : null;
};

// "Gestoffeerd of gemeubileerd" (either) stays 'unknown' on purpose: unknown
// passes every furnished_pref, which is exactly what "either" should do.
const FURNISHED_BY_LABEL: Record<string, Furnished> = {
  gemeubileerd: 'furnished',
  gestoffeerd: 'unfurnished',
  kaal: 'shell',
};

export interface CardFeatures {
  surfaceM2: number | null;
  /**
   * Cards show total rooms ("4 kamers"); Dutch convention counts the living
   * room, so bedrooms ≈ kamers - 1 (a 1-kamer studio has 0 separate bedrooms).
   */
  bedrooms: number | null;
  furnished: Furnished;
}

export function parseCardFeatures($card: Selection): CardFeatures {
  const surfaceM2 = parseInteger(
    cleanText($card.find('.illustrated-features__item--surface-area').first().text()),
  );
  const rooms = parseInteger(
    cleanText($card.find('.illustrated-features__item--number-of-rooms').first().text()),
  );
  const interior = cleanText(
    $card.find('.illustrated-features__item--interior').first().text(),
  ).toLowerCase();

  return {
    surfaceM2,
    bedrooms: rooms === null ? null : Math.max(rooms - 1, 0),
    furnished: FURNISHED_BY_LABEL[interior] ?? 'unknown',
  };
}

/**
 * Card photo URL. Lazy-loaded cards carry an inline SVG placeholder in img
 * src; the real photo lives in a <source srcset> inside a <template>, which
 * selectors do not cross — .contents() does. Takes the largest srcset entry.
 */
export function parseCardImage($card: Selection): string | null {
  let imageSrc = $card.find('img.picture__image').first().attr('src');
  if (!imageSrc || imageSrc.startsWith('data:')) {
    const srcset =
      $card.find('picture source').first().attr('srcset') ??
      $card.find('template').contents().find('source').first().attr('srcset');
    imageSrc = srcset?.split(',').at(-1)?.trim().split(/\s+/)[0];
  }
  return imageSrc ?? null;
}

/** "2611 KS Delft (Centrum-Oost)" -> "2611 KS Delft" (postcode + city, no neighbourhood). */
export function parseCardLocality($card: Selection): string {
  return cleanText(
    $card.find('.listing-search-item__sub-title').first().text().replace(/\(.*?\)/g, ''),
  );
}

export function parseCardPrice($card: Selection): number | null {
  const main = cleanText($card.find('.listing-search-item__price-main').first().text());
  if (main) return parseInteger(main);
  // "with-total-price" card variant: "Kale huurprijs € 2.900 per maand".
  // The label has no digits, so parsing the whole block text is safe.
  return parseInteger(cleanText($card.find('.listing-search-item__price-bare').first().text()));
}
