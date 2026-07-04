import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseRentumoHtml } from './rentumo.js';

const fixture = readFileSync('fixtures/rentumo/latest.html', 'utf8');

describe('parseRentumoHtml (fixture)', () => {
  const listings = parseRentumoHtml(fixture);

  it('parses every card (sort_by=date_desc verified working without search_id)', () => {
    expect(listings).toHaveLength(18); // "18 huurwoningen gevonden"
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/rentumo\.nl\/advertentie\/.+/);
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first card, address reconstructed from the slug', () => {
    expect(listings[0]).toEqual({
      source: 'rentumo',
      externalId: '551340',
      url: 'https://rentumo.nl/advertentie/martinus-nijhofflaan-2-v7-551340',
      addressRaw: 'Martinus nijhofflaan 2 v7, Delft', // from the detail slug
      priceEur: 1180,
      surfaceM2: 64,
      bedrooms: 1, // 2 kamers -> 1 bedroom
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/img\.rentumo\.com\/.+/), // lazy data-src
      city: 'Delft',
    });
  });

  it('slug-derived address enables cross-source dedupe with pararius', () => {
    // Same unit as pararius "Martinus Nijhofflaan 2 V 7" at €1.180 -> same key.
    expect(normalize(listings[0]!).dedupeKey).toBe('martinusnijhofflaan-2v7-47');
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseRentumoHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseRentumoHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips cards without id/link, keeps a valid Delft card', () => {
    const card = (id: string, city: string) => `
      <div class="listing-item" data-listing-id="${id}">
        <a href="/advertentie/teststraat-5-${id}"><p>${city}</p></a>
        <ul><li>3 kamers</li><li>Studio</li><li>45 m²</li></ul>
        <strong>€ 995</strong>
      </div>`;
    const broken = '<div class="listing-item" data-listing-id="9"><p>Delft</p></div>';
    const listings = parseRentumoHtml(broken + card('7', 'Rijswijk') + card('8', 'Delft'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: '8',
      addressRaw: 'Teststraat 5, Delft',
      priceEur: 995,
      surfaceM2: 45,
      bedrooms: 2,
      propertyType: 'studio',
    });
  });
});
