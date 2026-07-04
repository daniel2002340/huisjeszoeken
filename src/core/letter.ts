import type { Listing } from './types.js';

/**
 * Application-letter template interpolation (PLAN.md §4). Template-only in v1:
 * instant and deterministic. Placeholders look like {adres} and are filled from
 * profile letter_vars plus listing-derived values.
 */

/** Fallback salutation when the agency is unknown (PLAN.md §4). */
export const FALLBACK_SALUTATION = 'heer/mevrouw';

/**
 * Fill {placeholders} from vars. Placeholders without a value stay visible in
 * the output on purpose — a literal "{telefoon}" in a preview signals a
 * missing letter_var instead of silently sending an incomplete sentence.
 */
export function renderLetter(template: string, vars: Record<string, string>): string {
  return template.replace(/\{([a-z_][a-z0-9_]*)\}/gi, (match, key: string) => vars[key] ?? match);
}

export interface LetterProfile {
  letterTemplate: string;
  letterVars: Record<string, string>;
}

/** Render a profile's letter for a listing, with §4 listing-derived fallbacks. */
export function renderApplicationLetter(listing: Listing, profile: LetterProfile): string {
  return renderLetter(profile.letterTemplate, {
    ...profile.letterVars,
    // Listing-derived values win over accidental letter_vars with the same name.
    adres: (listing.addressRaw.split(',')[0] ?? listing.addressRaw).trim(),
    makelaar_of_verhuurder: listing.agency ?? FALLBACK_SALUTATION,
  });
}
