import { describe, expect, it } from 'vitest';
import { matchesProfile, type MatchableListing, type MatchProfile } from './matcher.js';

const profile = (overrides: Partial<MatchProfile> = {}): MatchProfile => ({
  active: true,
  minPrice: 900,
  maxPrice: 1500,
  minBedrooms: null,
  minSurfaceM2: null,
  propertyTypes: ['apartment', 'studio'],
  postcodes: [],
  furnishedPref: 'any',
  ...overrides,
});

const listing = (overrides: Partial<MatchableListing> = {}): MatchableListing => ({
  priceEur: 1200,
  bedrooms: 2,
  surfaceM2: 60,
  propertyType: 'apartment',
  furnished: 'furnished',
  postcode: '2611 JK',
  ...overrides,
});

describe('matchesProfile', () => {
  it('matches a listing inside all bounds', () => {
    expect(matchesProfile(listing(), profile())).toBe(true);
  });

  it('never matches an inactive profile', () => {
    expect(matchesProfile(listing(), profile({ active: false }))).toBe(false);
  });

  describe('price bounds', () => {
    it('rejects below min and above max', () => {
      expect(matchesProfile(listing({ priceEur: 899 }), profile())).toBe(false);
      expect(matchesProfile(listing({ priceEur: 1501 }), profile())).toBe(false);
    });

    it('accepts exactly min and exactly max (inclusive)', () => {
      expect(matchesProfile(listing({ priceEur: 900 }), profile())).toBe(true);
      expect(matchesProfile(listing({ priceEur: 1500 }), profile())).toBe(true);
    });

    it('unknown price passes (over-send)', () => {
      expect(matchesProfile(listing({ priceEur: null }), profile())).toBe(true);
    });

    it('open bounds pass anything', () => {
      expect(
        matchesProfile(listing({ priceEur: 99999 }), profile({ minPrice: null, maxPrice: null })),
      ).toBe(true);
    });
  });

  describe('bedrooms and surface', () => {
    it('rejects too few bedrooms, accepts unknown', () => {
      expect(matchesProfile(listing({ bedrooms: 1 }), profile({ minBedrooms: 2 }))).toBe(false);
      expect(matchesProfile(listing({ bedrooms: null }), profile({ minBedrooms: 2 }))).toBe(true);
    });

    it('rejects too small surface, accepts unknown', () => {
      expect(matchesProfile(listing({ surfaceM2: 40 }), profile({ minSurfaceM2: 50 }))).toBe(false);
      expect(matchesProfile(listing({ surfaceM2: null }), profile({ minSurfaceM2: 50 }))).toBe(
        true,
      );
    });
  });

  describe('property type', () => {
    it('rejects a type outside the profile list', () => {
      expect(matchesProfile(listing({ propertyType: 'room' }), profile())).toBe(false);
    });

    it('unknown type passes (over-send)', () => {
      expect(matchesProfile(listing({ propertyType: 'unknown' }), profile())).toBe(true);
    });

    it('an empty type list passes everything', () => {
      expect(matchesProfile(listing({ propertyType: 'room' }), profile({ propertyTypes: [] }))).toBe(
        true,
      );
    });
  });

  describe('postcode districts', () => {
    const p = profile({ postcodes: ['2611', '2628'] });

    it('accepts a listing whose 4-digit district is in the list', () => {
      expect(matchesProfile(listing({ postcode: '2611 JK' }), p)).toBe(true);
      expect(matchesProfile(listing({ postcode: '2628 CD' }), p)).toBe(true);
    });

    it('rejects a district outside the list', () => {
      expect(matchesProfile(listing({ postcode: '2624 AB' }), p)).toBe(false);
    });

    it('matches on a district-only postcode (huure cards)', () => {
      expect(matchesProfile(listing({ postcode: '2611' }), p)).toBe(true);
      expect(matchesProfile(listing({ postcode: '2624' }), p)).toBe(false);
    });

    it('unknown postcode passes (over-send)', () => {
      expect(matchesProfile(listing({ postcode: null }), p)).toBe(true);
    });

    it('an empty postcode list passes everything', () => {
      expect(matchesProfile(listing({ postcode: '2624 AB' }), profile())).toBe(true);
    });
  });

  describe('furnished preference', () => {
    it("pref 'furnished' rejects unfurnished and shell, accepts unknown", () => {
      const p = profile({ furnishedPref: 'furnished' });
      expect(matchesProfile(listing({ furnished: 'unfurnished' }), p)).toBe(false);
      expect(matchesProfile(listing({ furnished: 'shell' }), p)).toBe(false);
      expect(matchesProfile(listing({ furnished: 'furnished' }), p)).toBe(true);
      expect(matchesProfile(listing({ furnished: 'unknown' }), p)).toBe(true);
    });

    it("pref 'unfurnished' rejects furnished, accepts shell", () => {
      const p = profile({ furnishedPref: 'unfurnished' });
      expect(matchesProfile(listing({ furnished: 'furnished' }), p)).toBe(false);
      expect(matchesProfile(listing({ furnished: 'shell' }), p)).toBe(true);
      expect(matchesProfile(listing({ furnished: 'unfurnished' }), p)).toBe(true);
    });

    it("pref 'any' accepts everything", () => {
      for (const furnished of ['furnished', 'unfurnished', 'shell', 'unknown'] as const) {
        expect(matchesProfile(listing({ furnished }), profile())).toBe(true);
      }
    });
  });

  it('the fully-unknown listing always matches an active profile (over-send)', () => {
    const unknownListing = listing({
      priceEur: null,
      bedrooms: null,
      surfaceM2: null,
      propertyType: 'unknown',
      furnished: 'unknown',
      postcode: null,
    });
    expect(
      matchesProfile(
        unknownListing,
        profile({
          minBedrooms: 3,
          minSurfaceM2: 80,
          furnishedPref: 'furnished',
          postcodes: ['2611'],
        }),
      ),
    ).toBe(true);
  });
});
