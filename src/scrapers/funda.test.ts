import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseFundaHtml } from './funda.js';

const fixture = readFileSync('fixtures/funda/latest.html', 'utf8');

describe('parseFundaHtml (fixture)', () => {
  const listings = parseFundaHtml(fixture);

  it('parses all listings from the embedded __NUXT_DATA__ payload', () => {
    expect(listings.length).toBe(15); // page 1 of the captured search
  });

  it('parses price, address and url for every listing', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/\S+.*Delft/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.funda\.nl\/detail\/huur\/delft\/.+\/\d+\/$/,
      );
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first listing completely', () => {
    expect(listings[0]).toEqual({
      source: 'funda',
      externalId: '44413025',
      url: 'https://www.funda.nl/detail/huur/delft/appartement-houttuinen-38-c/44413025/',
      addressRaw: 'Houttuinen 38 C, 2611 DX Delft',
      priceEur: 2110,
      surfaceM2: 49,
      bedrooms: 1, // funda exposes real bedroom counts, no kamers heuristic
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: '365Makelaardij',
      imageUrl:
        'https://cloud.funda.nl/tiara-media/1a1b529f-4612-4b8c-a180-141e32666810/e61ea90d-e3b2-4862-9175-46e59afbad11?options=width=700',
    });
  });

  it('maps object types and never yields empty agencies as strings', () => {
    const types = new Set(listings.map((l) => l.propertyType ?? 'unknown'));
    expect(
      [...types].every((t) => ['apartment', 'house', 'studio', 'room', 'unknown'].includes(t)),
    ).toBe(true);
    expect(types).toContain('apartment');
    for (const listing of listings) {
      expect(listing.agency).not.toBe('');
    }
  });

  it('every parsed listing passes normalize (zod + dedupe key)', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city, listing.externalId).toBe('Delft');
      expect(normalized.postcode, listing.externalId).toMatch(/^\d{4} [A-Z]{2}$/);
      expect(normalized.houseNo, listing.externalId).toBeTruthy();
      expect(normalized.dedupeKey).toBeTruthy();
    }
  });
});

describe('parseFundaHtml (robustness)', () => {
  it('returns [] for a page without the payload', () => {
    expect(parseFundaHtml('<html><body>bot wall</body></html>')).toEqual([]);
  });

  it('returns [] for a corrupt payload', () => {
    expect(
      parseFundaHtml('<script id="__NUXT_DATA__" type="application/json">{not json</script>'),
    ).toEqual([]);
    expect(
      parseFundaHtml('<script id="__NUXT_DATA__" type="application/json">"a string"</script>'),
    ).toEqual([]);
  });

  it('skips listing nodes without a detail url, keeps the rest', () => {
    // Minimal devalue payload: root(0) -> list(1) -> two listing dicts.
    const payload = [
      { items: 1 },
      [2, 3],
      { address: 4, price: 5, object_detail_page_relative_url: 6, id: 7 },
      { address: 4, price: 5 }, // no url -> not a listing node
      { city: 8, street_name: 9, house_number: 10, postal_code: 11 },
      { rent_price: 12 },
      '/detail/huur/delft/appartement-teststraat-1/12345678/',
      12345678,
      'Delft',
      'Teststraat',
      '1',
      '2611AB',
      [13],
      950,
    ];
    const html = `<script id="__NUXT_DATA__" type="application/json">${JSON.stringify(payload)}</script>`;
    const listings = parseFundaHtml(html);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: '12345678',
      addressRaw: 'Teststraat 1, 2611 AB Delft',
      priceEur: 950,
    });
  });
});
