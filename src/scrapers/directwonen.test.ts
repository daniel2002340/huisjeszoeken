import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseDirectwonenHtml } from './directwonen.js';

const fixture = readFileSync('fixtures/directwonen/latest.html', 'utf8');

describe('parseDirectwonenHtml (fixture)', () => {
  const listings = parseDirectwonenHtml(fixture);

  it('parses every card on the Delft page', () => {
    const cardCount = (fixture.match(/class="new-search-advert"/g) ?? []).length;
    expect(cardCount).toBe(13);
    expect(listings).toHaveLength(cardCount);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and a real detail url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      // Premium-wrapped links must be unwrapped to the actual detail page.
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/directwonen\.nl\/huurwoningen-huren\/delft\/.+-\d+$/,
      );
      expect(listing.url).not.toContain('premiumaccountpayment');
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first card completely (premium-wrapped footer link)', () => {
    expect(listings[0]).toEqual({
      source: 'directwonen',
      externalId: '517258',
      url: 'https://directwonen.nl/huurwoningen-huren/delft/martinus-nijhofflaan/appartement-517258',
      addressRaw: 'M. Nijhofflaan, Delft', // abbreviated street, no house number
      priceEur: 1180,
      surfaceM2: 64,
      bedrooms: 1, // 2 kmr -> 1 bedroom
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/resources\.directwonen\.nl\/image\/.+/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseDirectwonenHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseDirectwonenHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips cards without a footer link and non-Delft cards', () => {
    const card = (city: string, footer: string) => `
      <div class="new-search-advert">
        <div class="advert-header">
          <span class="advert-location-header h2">Studio</span>
          <div class="advert-location-price">&euro; 900</div>
          <h3 class="location-text">Teststraat, ${city}</h3>
        </div>
        <div class="small-banner rooms"><p class="small-banner-top">1</p></div>
        <div class="small-banner surface"><p class="small-banner-top">30</p></div>
        <div class="advertise-footer">${footer}</div>
      </div>`;
    const listings = parseDirectwonenHtml(
      card('Delft', '') + // no link -> skipped
        card('Rijswijk', '<a href="https://directwonen.nl/huurwoningen-huren/rijswijk/x/studio-2"></a>') +
        card('Delft', '<a href="https://directwonen.nl/huurwoningen-huren/delft/teststraat/studio-3"></a>'),
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: '3',
      priceEur: 900,
      surfaceM2: 30,
      bedrooms: 0,
      propertyType: 'studio',
    });
  });
});
