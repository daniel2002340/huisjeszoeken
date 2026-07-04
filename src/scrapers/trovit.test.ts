import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseTrovitHtml } from './trovit.js';

const fixture = readFileSync('fixtures/trovit/latest.html', 'utf8');

describe('parseTrovitHtml (fixture)', () => {
  const listings = parseTrovitHtml(fixture);

  it('keeps only Delft cards from the regional results', () => {
    const cardCount = (fixture.match(/class="snippet-listing"/g) ?? []).length;
    expect(cardCount).toBeGreaterThanOrEqual(20);
    expect(listings.length).toBeGreaterThanOrEqual(5);
    expect(listings.length).toBeLessThan(cardCount);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, redirect url and source portal for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/clk\.thribee\.com\//);
      expect(listing.externalId).toMatch(/^trovit-NL-\d+$/);
      expect(listing.agency, listing.externalId).toBeTruthy(); // source portal name
    }
  });

  it('parses the known first card', () => {
    expect(listings[0]).toMatchObject({
      source: 'trovit',
      externalId: 'trovit-NL-1800003782923706130',
      addressRaw: 'Appartement in Delft', // no street address on trovit cards
      priceEur: 1180,
      surfaceM2: 64,
      bedrooms: 1, // 2 kamers -> 1 bedroom
      propertyType: 'apartment',
      agency: 'HUUREXPERT',
    });
  });

  it('every parsed listing passes normalize with a listing-unique dedupe key', () => {
    for (const listing of listings) {
      expect(normalize(listing).dedupeKey).toBe(
        `u-trovit-${listing.externalId.toLowerCase().replace(/[^a-z0-9]/g, '')}`,
      );
    }
  });
});

describe('parseTrovitHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseTrovitHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips cards without a redirect link or outside Delft', () => {
    const card = (id: string, city: string, link = true) => `
      <article class="snippet-listing" data-id="${id}">
        ${link ? '<a href="https://clk.thribee.com/?x=1">' : '<a href="/elders">'}
        Studio in ${city}, Zuid-Holland</a>
        <span class="price__actual">€ 950/maand</span>
        <p>30 m²</p><p>1 kamers</p>
        <small>PORTAALX</small>
      </article>`;
    const listings = parseTrovitHtml(card('t1', 'Rotterdam') + card('t2', 'Delft', false) + card('t3', 'Delft'));
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: 't3',
      priceEur: 950,
      surfaceM2: 30,
      bedrooms: 0,
      propertyType: 'studio',
      agency: 'PORTAALX',
    });
  });
});
