import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseHuurwoningenHtml } from './huurwoningen.js';

const fixture = readFileSync('fixtures/huurwoningen/latest.html', 'utf8');

/** Minimal synthetic card to cover title words the fixture doesn't contain. */
const syntheticCard = (typeWord: string): string => `
  <ul><li class="search-list__item search-list__item--listing">
    <section class="listing-search-item listing-search-item--for-rent">
      <h3 class="listing-search-item__title">
        <a class="listing-search-item__link listing-search-item__link--title"
           href="/huren/delft/abc123/teststraat/">${typeWord} Teststraat</a>
      </h3>
      <div class="listing-search-item__sub-title">2611 AA Delft (Centrum)</div>
      <div class="listing-search-item__price">
        <span class="listing-search-item__price-main">€ 950 per maand</span>
      </div>
    </section>
  </li></ul>`;

describe('parseHuurwoningenHtml (fixture)', () => {
  const listings = parseHuurwoningenHtml(fixture);

  it('parses every listing card, ignoring banner/notification items', () => {
    const cardCount = (fixture.match(/search-list__item--listing/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(listings).toHaveLength(cardCount);
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/\S+.*delft/i);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.huurwoningen\.nl\/huren\/delft\//,
      );
      expect(listing.externalId).toMatch(/^[a-z0-9]+$/i);
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'huurwoningen',
      externalId: '3140f162',
      url: 'https://www.huurwoningen.nl/huren/delft/3140f162/vlamingstraat/',
      addressRaw: 'Vlamingstraat, 2611 KS Delft', // index cards show no house number
      priceEur: 2750,
      surfaceM2: 97,
      bedrooms: 3, // 4 kamers -> 3 bedrooms
      propertyType: 'apartment',
      furnished: 'unfurnished', // Gestoffeerd
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/.+/),
    });
  });

  it('maps property types found in the fixture', () => {
    const types = new Set(listings.map((l) => l.propertyType));
    expect(types).toContain('apartment');
    expect(types).toContain('house');
    expect(types.has('unknown')).toBe(false);
  });

  it('parses the bare rent from "with-total-price" card variants', () => {
    const bare = listings.find((l) => l.externalId === '524e467b');
    expect(bare?.priceEur).toBe(2900); // Kale huurprijs
  });

  it('every parsed listing passes normalize (zod + dedupe key)', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.dedupeKey).toBeTruthy();
      expect(normalized.city).toBe('Delft');
      expect(normalized.postcode).toMatch(/^\d{4} [A-Z]{2}$/);
    }
  });
});

describe('parseHuurwoningenHtml (synthetic cards)', () => {
  it.each([
    ['Appartement', 'apartment'],
    ['Studio', 'studio'],
    ['Kamer', 'room'],
    ['Huis', 'house'],
    ['Woningruil', 'unknown'],
  ])('maps title word %s to %s', (word, expected) => {
    const [listing] = parseHuurwoningenHtml(syntheticCard(word));
    expect(listing?.propertyType).toBe(expected);
    expect(listing?.priceEur).toBe(950);
  });

  it('keeps the full title as address when the type word is unknown', () => {
    const [listing] = parseHuurwoningenHtml(syntheticCard('Woningruil'));
    expect(listing?.addressRaw).toBe('Woningruil Teststraat, 2611 AA Delft');
  });

  it('strips a known type word from the address', () => {
    const [listing] = parseHuurwoningenHtml(syntheticCard('Appartement'));
    expect(listing?.addressRaw).toBe('Teststraat, 2611 AA Delft');
  });

  it('skips a card without a title link, keeps the rest', () => {
    const broken =
      '<ul><li class="search-list__item--listing"><section class="listing-search-item"><h3>kapot</h3></section></li></ul>';
    expect(parseHuurwoningenHtml(broken)).toEqual([]);
    expect(parseHuurwoningenHtml(broken + syntheticCard('Studio'))).toHaveLength(1);
  });
});
