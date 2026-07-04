import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuizenvinderHtml } from './huizenvinder.js';

const fixture = readFileSync('fixtures/huizenvinder/latest.html', 'utf8');

describe('parseHuizenvinderHtml (fixture)', () => {
  const listings = parseHuizenvinderHtml(fixture);

  it('parses the single-page inventory, Delft only', () => {
    const cardCount = (fixture.match(/SINGLE CARD/g) ?? []).length;
    expect(cardCount).toBe(25);
    expect(listings.length).toBeGreaterThanOrEqual(cardCount - 2); // tolerate ads/non-Delft
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.huizenvinder\.nl\/huren\/[a-z]+-delft\/.+\/\d+\/$/,
      );
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'huizenvinder',
      externalId: '99396',
      url: 'https://www.huizenvinder.nl/huren/appartement-delft/willem-van-aelststraat/99396/',
      addressRaw: 'Willem van Aelststraat, Delft', // no house number on cards
      priceEur: 860,
      surfaceM2: 56,
      bedrooms: 1, // 2 kamers -> 1 bedroom
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/cdn\.huizenvinder\.nl\/.+\.jpg$/),
      city: 'Delft',
    });
  });

  it('maps type from the url segment (apartment + studio present)', () => {
    const types = new Set(listings.map((l) => l.propertyType));
    expect(types).toContain('apartment');
    expect(types).toContain('studio');
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseHuizenvinderHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseHuizenvinderHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips non-Delft cards and non-numeric ids', () => {
    const card = (id: string, city: string) => `
      <div id="${id}" class="relative">
        <a class="group" href="/huren/studio-delft/teststraat/${id}/" title="t">
          <h3>Teststraat in ${city}</h3>
          <ul><li>€ 900 per maand</li><li>30m<sup>2</sup> - 1 kamer</li></ul>
        </a>
      </div>`;
    const listings = parseHuizenvinderHtml(card('11', 'Rijswijk') + card('12', 'Delft'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: '12',
      priceEur: 900,
      surfaceM2: 30,
      bedrooms: 0,
      propertyType: 'studio',
    });
  });
});
