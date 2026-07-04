import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuureHtml } from './huure.js';

const fixture = readFileSync('fixtures/huure/latest.html', 'utf8');

describe('parseHuureHtml (fixture)', () => {
  const listings = parseHuureHtml(fixture);

  it('parses all Delft cards and filters out neighbouring towns', () => {
    const cardCount = (fixture.match(/property-item blurry-shadow/g) ?? []).length;
    expect(cardCount).toBe(18); // bounding box leaks Rijswijk etc.
    expect(listings).toHaveLength(16);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/huure\.nl\/huurwoningen\/.+-\d+$/);
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'huure',
      externalId: '21123866',
      url: 'https://huure.nl/huurwoningen/2-kamer-appartement-in-delft-21123866',
      addressRaw: '2 kamer appartement in Delft (2624), Delft', // cards show no street
      priceEur: 855,
      surfaceM2: 53,
      bedrooms: 1, // 2 kamers -> 1 bedroom
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/de\.kvikca\.com\/.+\.jpg$/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a listing-unique dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      // No street address on huure cards -> never a shared (colliding) key.
      expect(normalized.dedupeKey).toBe(`u-huure-${listing.externalId}`);
    }
  });
});

describe('parseHuureHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseHuureHtml('<html><body>niets</body></html>')).toEqual([]);
  });

  it('skips a card without a detail link, keeps the rest', () => {
    const good = `
      <div class="property-item">
        <a href="/huurwoningen/studio-in-delft-99"><div class="visually-hidden">Studio in Delft</div></a>
        <div class="property-price"><a href="/huurwoningen/studio-in-delft-99">€ 900</a></div>
        <h3><span class="icon-sm location-pin-icon"></span>2611, Delft</h3>
      </div>`;
    const broken = '<div class="property-item"><h3>kapot</h3></div>';
    const listings = parseHuureHtml(broken + good);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ externalId: '99', priceEur: 900, city: 'Delft' });
  });
});
