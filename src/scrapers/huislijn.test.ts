import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuislijnHtml } from './huislijn.js';

const fixture = readFileSync('fixtures/huislijn/latest.html', 'utf8');

describe('parseHuislijnHtml (fixture)', () => {
  const listings = parseHuislijnHtml(fixture);

  it('parses every embedded SSR object, skipping the client-side template', () => {
    expect(listings).toHaveLength(13);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every listing', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, \d{4} [A-Z]{2} Delft$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.huislijn\.nl\/huurwoning\/.+/,
      );
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first listing completely', () => {
    expect(listings[0]).toEqual({
      source: 'huislijn',
      externalId: '4396178',
      url: 'https://www.huislijn.nl/huurwoning/nederland/zuid-holland/4396178/mercuriusweg-delft',
      addressRaw: 'Mercuriusweg, 2624 BC Delft', // housenumber field is empty
      priceEur: 1600,
      surfaceM2: 62,
      bedrooms: 1, // real AantalSlaapkamers
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/cdn-v3\.huislijn\.nl\/.+\/m\.jpg$/),
      city: 'Delft',
    });
  });

  it('maps Bovenwoning to house', () => {
    const boven = listings.find((l) => l.addressRaw.startsWith('Jan Campertlaan'));
    expect(boven?.propertyType).toBe('house');
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      expect(normalized.postcode).toMatch(/^\d{4} [A-Z]{2}$/);
    }
  });
});

describe('parseHuislijnHtml (robustness)', () => {
  const wrap = (obj: unknown) =>
    `<hl-search-object-display :object="${JSON.stringify(obj)
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')}"></hl-search-object-display>`;

  it('returns [] for a page without embedded objects', () => {
    // The client-side template binding must not be parsed as JSON.
    expect(
      parseHuislijnHtml('<hl-search-object-display :object="object"></hl-search-object-display>'),
    ).toEqual([]);
  });

  it('skips sale objects, rented objects and other cities', () => {
    const html = [
      wrap({ id: 1, type: 'sale', link: '/koop/x', city: 'Delft' }),
      wrap({ id: 2, type: 'rent', link: '/huur/y', city: 'Delft', status: 'Verhuurd' }),
      wrap({ id: 3, type: 'rent', link: '/huur/z', city: 'Rijswijk' }),
      wrap({ id: 4, type: 'rent', link: '/huurwoning/ok', city: 'Delft', street: 'Teststraat', price: '900.00' }),
    ].join('');
    const listings = parseHuislijnHtml(html);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ externalId: '4', priceEur: 900 });
  });
});
