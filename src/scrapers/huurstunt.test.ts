import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuurstuntHtml } from './huurstunt.js';

const fixture = readFileSync('fixtures/huurstunt/latest.html', 'utf8');

describe('parseHuurstuntHtml (fixture)', () => {
  const listings = parseHuurstuntHtml(fixture);

  it('parses the real cards, skipping the skeleton placeholders', () => {
    expect(listings.length).toBeGreaterThanOrEqual(10);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.huurstunt\.nl\/[a-z]+\/huren\/in\/delft\/.+/,
      );
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'huurstunt',
      externalId: 'f5hD6',
      url: 'https://www.huurstunt.nl/appartement/huren/in/delft/jan-de-oudeweg/f5hD6',
      addressRaw: 'Jan de Oudeweg, Delft', // no house number on cards
      priceEur: 1365,
      surfaceM2: 41,
      bedrooms: null, // rooms shown as "Onbekend"
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/www\.huurstunt\.nl\/rental-images/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseHuurstuntHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseHuurstuntHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips skeletons and non-Delft cards, keeps a valid card', () => {
    const card = (city: string, id: string) => `
      <article>
        <h3>Teststraat</h3>
        <img data-src="https://www.huurstunt.nl/rental-images-resize/x.jpeg" />
        <span>30 m2</span><span>2 kamers</span>
        <span>€ 950 /maand</span>
        <a href="https://www.huurstunt.nl/studio/huren/in/${city}/teststraat/${id}">Meer zien</a>
      </article>`;
    const skeleton = '<article class="animate-pulse"><div></div></article>';
    const listings = parseHuurstuntHtml(skeleton + card('rotterdam', 'x1') + card('delft', 'x2'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: 'x2',
      priceEur: 950,
      surfaceM2: 30,
      bedrooms: 1,
      propertyType: 'studio',
    });
  });
});
