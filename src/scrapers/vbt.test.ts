import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { keepDelft, parseVbtHtml } from './vbt.js';

// National page: 12 cards, currently no Delft inventory (vb&t rents out
// new-build projects in waves) — the Delft filter is covered synthetically.
const fixture = readFileSync('fixtures/vbt/latest.html', 'utf8');

describe('parseVbtHtml (fixture)', () => {
  const listings = parseVbtHtml(fixture);

  it('parses every card on the national page', () => {
    expect(listings).toHaveLength(12);
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/^\S.+, \S.+$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/vbtverhuurmakelaars\.nl\/woning\/.+/,
      );
      expect(listing.agency).toBe('vb&t Verhuurmakelaars');
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'vbt',
      externalId: 's-gravenhage-clioplein-24',
      url: 'https://vbtverhuurmakelaars.nl/woning/s-gravenhage-clioplein-24',
      addressRaw: "Clioplein 24, 's-Gravenhage", // full house numbers ✓
      priceEur: 2195,
      surfaceM2: 136,
      bedrooms: 3, // 4 kamers -> 3 bedrooms
      propertyType: 'apartment',
      furnished: 'unfurnished', // "Deze woning is gestoffeerd!" usp line
      agency: 'vb&t Verhuurmakelaars',
      imageUrl: expect.stringMatching(/^https:\/\/vbtverhuurmakelaars\.nl\/images\/.+/),
      city: "'s-Gravenhage",
    });
  });

  it('fixture has no Delft cards; every listing still passes normalize', () => {
    expect(keepDelft(listings)).toEqual([]);
    for (const listing of listings) {
      expect(normalize(listing).dedupeKey).toBeTruthy();
    }
  });
});

describe('parseVbtHtml (synthetic)', () => {
  const card = (city: string, street: string, status = 'Beschikbaar') => `
    <a href="/woning/${city.toLowerCase()}-${street.toLowerCase().replace(/\s+/g, '-')}" class="property">
      <div class="visual">
        <div class="visimage" style="background-image: url(/images/abc/x-1)"></div>
        <span class="status">${status}</span>
      </div>
      <div class="items"><div>${city}</div><span class="normal">${street}</span>
        <div class="price">€ 1.250,-</div>
        <table>
          <tr><td>Soort object</td><td>Appartement</td></tr>
          <tr><td>Woonoppervlakte</td><td>60 m²</td></tr>
          <tr><td>Kamers</td><td>3 Kamers</td></tr>
        </table>
      </div>
    </a>`;

  it('keepDelft keeps Delft cards only', () => {
    const listings = parseVbtHtml(card('Delft', 'Teststraat 12') + card('Eindhoven', 'Anderelaan 3'));
    const delft = keepDelft(listings);
    expect(listings).toHaveLength(2);
    expect(delft).toHaveLength(1);
    expect(delft[0]).toMatchObject({
      addressRaw: 'Teststraat 12, Delft',
      priceEur: 1250,
      surfaceM2: 60,
      bedrooms: 2,
      propertyType: 'apartment',
    });
    // Full street + number -> semantic cross-source dedupe key.
    expect(normalize(delft[0]!).dedupeKey).toBe('teststraat-12-50');
  });

  it('skips rented cards and returns [] for empty pages', () => {
    expect(parseVbtHtml(card('Delft', 'Teststraat 12', 'Verhuurd'))).toEqual([]);
    expect(parseVbtHtml('<html><body>leeg</body></html>')).toEqual([]);
  });
});
