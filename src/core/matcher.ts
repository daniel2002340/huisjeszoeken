import type { Listing } from './types.js';

/**
 * Profile matching (PLAN.md §4). Unknown listing fields PASS the filter:
 * over-send rather than silently drop a possible match (PLAN.md §2, CLAUDE.md).
 * Better a false positive than a missed house.
 */

/** The profile fields matching needs; DB profile rows satisfy this. */
export interface MatchProfile {
  active: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minSurfaceM2: number | null;
  propertyTypes: string[];
  furnishedPref: string; // 'any' | 'furnished' | 'unfurnished'
}

export type MatchableListing = Pick<
  Listing,
  'priceEur' | 'bedrooms' | 'surfaceM2' | 'propertyType' | 'furnished'
>;

export function matchesProfile(listing: MatchableListing, profile: MatchProfile): boolean {
  if (!profile.active) return false;

  if (listing.priceEur !== null) {
    if (profile.minPrice !== null && listing.priceEur < profile.minPrice) return false;
    if (profile.maxPrice !== null && listing.priceEur > profile.maxPrice) return false;
  }

  if (
    listing.bedrooms !== null &&
    profile.minBedrooms !== null &&
    listing.bedrooms < profile.minBedrooms
  ) {
    return false;
  }

  if (
    listing.surfaceM2 !== null &&
    profile.minSurfaceM2 !== null &&
    listing.surfaceM2 < profile.minSurfaceM2
  ) {
    return false;
  }

  if (
    listing.propertyType !== 'unknown' &&
    profile.propertyTypes.length > 0 &&
    !profile.propertyTypes.includes(listing.propertyType)
  ) {
    return false;
  }

  if (listing.furnished !== 'unknown' && profile.furnishedPref !== 'any') {
    // 'shell' (kaal) counts as unfurnished: it fails a 'furnished' preference
    // but satisfies an 'unfurnished' one.
    if (profile.furnishedPref === 'furnished' && listing.furnished !== 'furnished') return false;
    if (profile.furnishedPref === 'unfurnished' && listing.furnished === 'furnished') return false;
  }

  return true;
}
