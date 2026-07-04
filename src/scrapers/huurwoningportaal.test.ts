import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuurwoningportaalDetail, parseHuurwoningportaalHtml } from './huurwoningportaal.js';

const fixture = readFileSync('fixtures/huurwoningportaal/latest.html', 'utf8');

describe('parseHuurwoningportaalHtml (fixture)', () => {
  const listings = parseHuurwoningportaalHtml(fixture);

  it('parses every card; group_ids=2650 yields Delft only', () => {
    const cardCount = (fixture.match(/property-component-card/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(listings).toHaveLength(cardCount);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/^\S.*, Delft$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/huurwoningportaal\.nl\/huurwoning\/.+/,
      );
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'huurwoningportaal',
      externalId: '10474924',
      url: 'https://huurwoningportaal.nl/huurwoning/2-kamer-appartement-in-delft-a51dde',
      addressRaw: 'Martinus Nijhofflaan, Delft', // no house number on cards
      priceEur: 1035,
      surfaceM2: 47,
      bedrooms: 1, // 2 kamers -> 1 bedroom
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/.+cloudfront\.net\/.+/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a listing-unique dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      // No house number on the cards -> never a colliding key.
      expect(normalized.dedupeKey).toBe(`u-huurwoningportaal-${listing.externalId}`);
    }
  });
});

describe('parseHuurwoningportaalHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseHuurwoningportaalHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips a card without data-id, keeps a valid one', () => {
    const good = `
      <a class="property-component-card" data-id="42" href="/huurwoning/studio-in-delft-x1">
        <div class="content">
          <div class="title">Studio<span class="divider">|</span><span class="location-title">1 kamer op 25 m2</span></div>
          <div class="location">Teststraat,<span class="zip-code-name">Delft</span></div>
          <div class="price"><span class="price-amount">925</span><span class="price-unit">EUR</span></div>
        </div>
      </a>`;
    const broken = '<a class="property-component-card" href="/huurwoning/kapot"><div class="title">Kapot</div></a>';
    const listings = parseHuurwoningportaalHtml(broken + good);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: '42',
      addressRaw: 'Teststraat, Delft',
      priceEur: 925,
      surfaceM2: 25,
      bedrooms: 0, // 1 kamer -> 0 separate bedrooms
      propertyType: 'studio',
    });
  });
});

describe('parseHuurwoningportaalDetail (fixture)', () => {
  it('extracts the address line incl. postcode from the detail page', () => {
    const html = readFileSync('fixtures/huurwoningportaal/detail.html', 'utf8');
    expect(parseHuurwoningportaalDetail(html)).toBe('Martinus Nijhofflaan, 2624 ES Delft');
  });

  it('returns null when the address element is missing', () => {
    expect(parseHuurwoningportaalDetail('<html><body>niets</body></html>')).toBeNull();
  });
});
