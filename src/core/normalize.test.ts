import { describe, expect, it } from 'vitest';
import { buildDedupeKey, normalize, parseAddress, slug } from './normalize.js';
import type { RawListing } from './types.js';

const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  source: 'pararius',
  externalId: 'voorstraat-12-delft',
  url: 'https://www.pararius.nl/appartement-te-huur/delft/voorstraat-12',
  addressRaw: 'Voorstraat 12, 2611 JK Delft',
  priceEur: 1450,
  ...overrides,
});

describe('slug', () => {
  it('lowercases, strips diacritics and non-alphanumerics', () => {
    expect(slug('Van Foreestweg')).toBe('vanforeestweg');
    expect(slug("Hugo de Groot-straat")).toBe('hugodegrootstraat');
    expect(slug('Zusterlaan é')).toBe('zusterlaane');
  });
});

describe('parseAddress', () => {
  it('parses street, house number, postcode and city', () => {
    expect(parseAddress('Voorstraat 12, 2611 JK Delft')).toEqual({
      street: 'Voorstraat',
      houseNo: '12',
      postcode: '2611 JK',
      city: 'Delft',
    });
  });

  it('parses a bare street + number', () => {
    expect(parseAddress('Voorstraat 12')).toEqual({
      street: 'Voorstraat',
      houseNo: '12',
      postcode: null,
      city: null,
    });
  });

  it('normalizes house number suffixes', () => {
    expect(parseAddress('Voorstraat 12-A').houseNo).toBe('12a');
  });

  it('handles a trailing city without postcode', () => {
    expect(parseAddress('Voorstraat 12, Delft')).toEqual({
      street: 'Voorstraat',
      houseNo: '12',
      postcode: null,
      city: 'Delft',
    });
  });

  it('keeps unparseable parts null instead of failing', () => {
    expect(parseAddress('Centrum')).toEqual({
      street: 'Centrum',
      houseNo: null,
      postcode: null,
      city: null,
    });
  });
});

describe('buildDedupeKey', () => {
  it('combines street slug, house number and €25 price bucket', () => {
    expect(buildDedupeKey('Voorstraat', '12', 1450, 'pararius', 'abc1')).toBe('voorstraat-12-58');
  });

  it('marks unknown price instead of dropping the listing', () => {
    expect(buildDedupeKey('Voorstraat', '12', null, 'pararius', 'abc1')).toBe('voorstraat-12-x');
  });

  it('gives a listing-unique key when the house number is missing', () => {
    // A street-only key would swallow distinct units on the same street in
    // the same price bucket — over-send instead.
    expect(buildDedupeKey('Voorstraat', null, 1000, 'huurwoningen', 'x9')).toBe(
      'u-huurwoningen-x9',
    );
    expect(buildDedupeKey(null, null, 1000, 'huure', '21123866')).toBe('u-huure-21123866');
  });
});

describe('normalize', () => {
  it('produces a full Listing with parsed address and dedupe key', () => {
    const listing = normalize(raw());
    expect(listing).toMatchObject({
      source: 'pararius',
      externalId: 'voorstraat-12-delft',
      street: 'Voorstraat',
      houseNo: '12',
      postcode: '2611 JK',
      city: 'Delft',
      priceEur: 1450,
      dedupeKey: 'voorstraat-12-58',
    });
  });

  it('defaults missing optional fields to unknown/null (over-send, never drop)', () => {
    const listing = normalize(raw());
    expect(listing.propertyType).toBe('unknown');
    expect(listing.furnished).toBe('unknown');
    expect(listing.bedrooms).toBeNull();
    expect(listing.surfaceM2).toBeNull();
    expect(listing.agency).toBeNull();
  });

  it('rejects invalid scraped input', () => {
    expect(() => normalize(raw({ url: 'not-a-url' }))).toThrow();
  });
});
