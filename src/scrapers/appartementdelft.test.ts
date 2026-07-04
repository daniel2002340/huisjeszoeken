import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseAppartementDelftHtml } from './appartementdelft.js';

const fixture = readFileSync('fixtures/appartementdelft/latest.html', 'utf8');

describe('parseAppartementDelftHtml (fixture)', () => {
  const listings = parseAppartementDelftHtml(fixture);

  it('parses every listing card on the index', () => {
    const cardCount = (fixture.match(/class="col-sm-6 listing"/g) ?? []).length;
    expect(cardCount).toBeGreaterThan(0);
    expect(listings).toHaveLength(cardCount);
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, \d{4} [A-Z]{2} Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/www\.appartementdelft\.nl\/.+/);
    }
  });

  it('parses the known first card completely, house number recovered from the slug', () => {
    expect(listings[0]).toEqual({
      source: 'appartementdelft',
      externalId: 'roland-holstbuurt/jan-campertlaan-22',
      url: 'https://www.appartementdelft.nl/roland-holstbuurt/jan-campertlaan-22',
      // ld+json says "Jan Campertlaan 0"; the real number comes from the slug.
      addressRaw: 'Jan Campertlaan 22, 2624 NZ Delft',
      priceEur: 1060,
      surfaceM2: 115,
      bedrooms: 4, // 5 kamers -> 4 bedrooms
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/www\.appartementdelft\.nl\/img\/.+/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a full semantic dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      expect(normalized.postcode, listing.externalId).toMatch(/^\d{4} [A-Z]{2}$/);
      // Street + slug-recovered house number -> semantic cross-source key.
      expect(normalized.dedupeKey, listing.externalId).toMatch(/^[a-z0-9]+-\d+[a-z]?-(\d+|x)$/);
    }
  });
});

describe('parseAppartementDelftHtml (robustness)', () => {
  it('returns [] for a page without cards', () => {
    expect(parseAppartementDelftHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('survives a card with corrupt ld+json using markup-only fields', () => {
    const card = `
      <div class="col-sm-6 listing" data-number="1">
        <script type="application/ld+json">{oops</script>
        <div class="listing-price">&euro; 950</div>
        <div class="listing-details">
          <h2 class="listing-title"><a href="https://www.appartementdelft.nl/wijk/teststraat-5">Teststraat</a></h2>
        </div>
      </div>`;
    const [listing] = parseAppartementDelftHtml(card);
    expect(listing).toMatchObject({
      externalId: 'wijk/teststraat-5',
      priceEur: 950,
      addressRaw: 'wijk/teststraat-5, Delft', // no ld+json -> falls back to slug
      surfaceM2: null,
      bedrooms: null,
      propertyType: 'unknown',
    });
  });
});
