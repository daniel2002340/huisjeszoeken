import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseIkwilhurenHtml } from './ikwilhuren.js';

const fixture = readFileSync('fixtures/ikwilhuren/latest.html', 'utf8');

describe('parseIkwilhurenHtml (fixture)', () => {
  const listings = parseIkwilhurenHtml(fixture);

  it('keeps only Delft cards from the +10km radius results', () => {
    const cardCount = (fixture.match(/card card-woning/g) ?? []).length;
    expect(cardCount).toBe(10); // page contains Den Haag / Berkel etc.
    expect(listings).toHaveLength(2);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, \d{4} [A-Z]{2} Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/ikwilhuren\.nu\/object\/.+\/$/);
      expect(listing.externalId).toMatch(/^[a-f0-9]{16,}$/);
    }
  });

  it('parses the known first Delft card completely', () => {
    expect(listings[0]).toEqual({
      source: 'ikwilhuren',
      externalId: '63c965c12f1a03fb7f5f65f4854b57f9',
      url: 'https://ikwilhuren.nu/object/delft-2625wl-60-pierre-van-hauwelaan-63c965c12f1a03fb7f5f65f4854b57f9/',
      addressRaw: 'Pierre van Hauwelaan 60, 2625 WL Delft',
      priceEur: 1242,
      surfaceM2: 48,
      bedrooms: null, // not on the cards
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: 'MVGM',
      imageUrl: expect.stringMatching(/^https:\/\/[a-z]\.static\.nbo\.nl\/.+thumb\.jpg$/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a semantic dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      expect(normalized.postcode).toMatch(/^\d{4} [A-Z]{2}$/);
      // Full street + house number -> cross-source capable key.
      expect(normalized.dedupeKey).toMatch(/^[a-z0-9]+-\d+[a-z0-9]*-(\d+|x)$/);
    }
  });
});

describe('parseIkwilhurenHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseIkwilhurenHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('skips a card without a link, keeps a valid Delft card', () => {
    const good = `
      <div class="card card-woning">
        <div class="card-body">
          <span class="card-title"><a class="stretched-link" href="/object/delft-2611aa-1-teststraat-abcdef1234567890abcdef1234567890/">Studio Teststraat 1</a></span>
          <span>2611AA Delft - 0Km.</span>
          <div class="dotted-spans"><span class="fw-bold">€ 950,- /mnd</span><span>30 m<sup>2</sup></span></div>
        </div>
      </div>`;
    const broken = '<div class="card card-woning"><div class="card-body"><span>kapot</span></div></div>';
    const listings = parseIkwilhurenHtml(broken + good);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: 'abcdef1234567890abcdef1234567890',
      addressRaw: 'Teststraat 1, 2611 AA Delft',
      priceEur: 950,
      surfaceM2: 30,
      propertyType: 'studio',
    });
  });
});
