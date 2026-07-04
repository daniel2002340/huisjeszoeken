import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseRentHtml } from './rent.js';

const fixture = readFileSync('fixtures/rent/latest.html', 'utf8');

describe('parseRentHtml (fixture)', () => {
  const listings = parseRentHtml(fixture);

  it('parses every page-1 card (sorted nieuw ➡️ oud by the site)', () => {
    const cardCount = (fixture.match(/SINGLE CARD/g) ?? []).length;
    expect(cardCount).toBe(25);
    expect(listings).toHaveLength(cardCount);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and signup url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(100);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      // Details are signup-gated; the card link is the only one that exists.
      expect(listing.url).toBe(`https://www.rent.nl/aanmelden/?id=${listing.externalId}`);
      expect(listing.agency).toBeNull(); // source is blurred by the site
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'rent',
      externalId: '308850',
      url: 'https://www.rent.nl/aanmelden/?id=308850',
      addressRaw: 'Rochussenstraat, Delft',
      priceEur: 690,
      surfaceM2: 21,
      bedrooms: null,
      propertyType: 'room', // from the <!-- // kamer --> comment
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/.+/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a safe dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      // Streets usually lack a house number (unique key), but some cards do
      // carry one ("Martinus Nijhofflaan 2 V-7" -> semantic key).
      expect(normalized.dedupeKey).toMatch(
        new RegExp(`^(u-rent-${listing.externalId}|[a-z0-9]+-[a-z0-9]+-(\\d+|x))$`),
      );
    }
    // The common case stays listing-unique:
    expect(normalize(listings[0]!).dedupeKey).toBe(`u-rent-${listings[0]!.externalId}`);
  });
});

describe('parseRentHtml (robustness)', () => {
  const card = (id: string, street: string, comment: string | null) => `
    <div id="${id}" class="relative mb-12 group grid">
      <img src="https://example.com/x.jpg" />
      <p class="font-bold">${street},<br/>Delft</p>
      <p class="font-bold">€ 1.100 p/m</p>
      <p>45m&#xB2;</p>
    </div>${comment === null ? '' : `\n<!-- // ${comment} -->`}`;

  it('returns [] for a page without cards', () => {
    expect(parseRentHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('maps the trailing type comment, unknown when missing', () => {
    const listings = parseRentHtml(
      card('1', 'Aweg', 'appartement') + card('2', 'Bweg', 'studio') + card('3', 'Cweg', null),
    );
    expect(listings.map((l) => l.propertyType)).toEqual(['apartment', 'studio', 'unknown']);
    expect(listings[0]).toMatchObject({ priceEur: 1100, surfaceM2: 45 });
  });
});
