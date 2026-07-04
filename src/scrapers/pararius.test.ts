import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseParariusHtml } from './pararius.js';

const fixture = readFileSync('fixtures/pararius/latest.html', 'utf8');

/** Minimal synthetic card to cover URL segments the fixture doesn't contain. */
const syntheticCard = (typeSegment: string, typeWord: string): string => `
  <ul><li class="search-list__item search-list__item--listing">
    <section class="listing-search-item listing-search-item--for-rent">
      <h3 class="listing-search-item__title">
        <a class="listing-search-item__link listing-search-item__link--title"
           href="/${typeSegment}/delft/abc123/teststraat">${typeWord} Teststraat 1</a>
      </h3>
      <div class="listing-search-item__sub-title">2611 AA Delft (Centrum)</div>
      <div class="listing-search-item__price">
        <span class="listing-search-item__price-main">€ 950 per maand</span>
      </div>
    </section>
  </li></ul>`;

describe('parseParariusHtml (fixture)', () => {
  const listings = parseParariusHtml(fixture);

  it('parses every listing card in the fixture', () => {
    const cardCount = (fixture.match(/search-list__item--listing/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(listings).toHaveLength(cardCount);
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/\S+.*delft/i);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.pararius\.nl\/[a-z]+-te-huur\/delft\//,
      );
      expect(listing.externalId).toMatch(/^[a-z0-9]+$/i);
    }
  });

  it('parses the known first card completely', () => {
    expect(listings[0]).toEqual({
      source: 'pararius',
      externalId: '2e760d4e',
      url: 'https://www.pararius.nl/appartement-te-huur/delft/2e760d4e/vlamingstraat',
      addressRaw: 'Vlamingstraat 33, 2611 KS Delft',
      priceEur: 2750,
      surfaceM2: 97,
      bedrooms: 3, // 4 kamers -> 3 bedrooms
      propertyType: 'apartment',
      furnished: 'unfurnished', // Gestoffeerd
      agency: 'Huizenbalie.nl',
      imageUrl: expect.stringMatching(/^https:\/\/.+\.jpg/),
    });
  });

  it('resolves a real https image for every card, never a lazy-load placeholder', () => {
    // Every card in this fixture has a photo (direct img or inside <template>).
    for (const listing of listings) {
      expect(listing.imageUrl, listing.externalId).toMatch(/^https:/);
    }
  });

  it('maps property types found in the fixture', () => {
    const types = new Set(listings.map((l) => l.propertyType));
    expect(types).toContain('apartment');
    expect(types).toContain('house');
    expect(types.has('unknown')).toBe(false);
  });

  it('every parsed listing passes normalize (zod + dedupe key)', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      // Semantic key (street-houseno-bucket) or listing-unique key when the
      // card shows no house number.
      expect(normalized.dedupeKey).toMatch(/^([a-z0-9]+-[a-z0-9]+-(\d+|x)|u-pararius-[a-z0-9]+)$/);
      expect(normalized.city).toBe('Delft');
    }
  });
});

describe('parseParariusHtml (synthetic cards)', () => {
  it.each([
    ['appartement-te-huur', 'Appartement', 'apartment'],
    ['studio-te-huur', 'Studio', 'studio'],
    ['kamer-te-huur', 'Kamer', 'room'],
    ['huis-te-huur', 'Huis', 'house'],
    ['iets-anders-te-huur', 'Iets', 'unknown'],
  ])('maps %s to %s', (segment, word, expected) => {
    const [listing] = parseParariusHtml(syntheticCard(segment, word));
    expect(listing?.propertyType).toBe(expected);
    // Unknown type words are not stripped from the title, known ones are.
    expect(listing?.addressRaw).toMatch(/Teststraat 1, 2611 AA Delft$/);
    expect(listing?.priceEur).toBe(950);
  });

  it('defaults missing optional fields instead of throwing', () => {
    const [listing] = parseParariusHtml(syntheticCard('appartement-te-huur', 'Appartement'));
    expect(listing).toMatchObject({
      surfaceM2: null,
      bedrooms: null,
      furnished: 'unknown',
      agency: null,
      imageUrl: null,
    });
  });

  it('skips a card without a title link, keeps the rest', () => {
    const broken = '<ul><li class="search-list__item--listing"><section class="listing-search-item"><h3>kapot</h3></section></li></ul>';
    expect(parseParariusHtml(broken)).toEqual([]);
    const mixed = broken + syntheticCard('studio-te-huur', 'Studio');
    expect(parseParariusHtml(mixed)).toHaveLength(1);
  });
});
