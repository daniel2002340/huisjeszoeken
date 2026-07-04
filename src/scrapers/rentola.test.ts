import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseRentolaHtml } from './rentola.js';

const fixture = readFileSync('fixtures/rentola/latest.html', 'utf8');

describe('parseRentolaHtml (fixture)', () => {
  const listings = parseRentolaHtml(fixture);

  it('parses every unique listing card', () => {
    const unique = new Set(
      [...fixture.matchAll(/href="(\/listings\/[^"]+)"/g)].map((m) => m[1]),
    );
    expect(unique.size).toBe(21);
    expect(listings).toHaveLength(unique.size);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, address and url for every card', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/rentola\.nl\/listings\/.+/);
    }
  });

  it('parses the known first card completely (real bedrooms, full address)', () => {
    expect(listings[0]).toEqual({
      source: 'rentola',
      externalId: 'p541361',
      url: 'https://rentola.nl/listings/appartement-jan-de-oudeweg-260-2628-sj-delft-p541361',
      addressRaw: 'Jan de Oudeweg 332, 2628 SJ Delft',
      priceEur: 1022,
      surfaceM2: 36,
      bedrooms: 1, // "1-slaapkamer" — real bedrooms, no kamers heuristic
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/img2\.rentola\.com\/.+/),
      city: 'Delft',
    });
  });

  it('full addresses give semantic cross-source dedupe keys', () => {
    const normalized = normalize(listings[0]!);
    expect(normalized.postcode).toBe('2628 SJ');
    expect(normalized.dedupeKey).toMatch(/^jandeoudeweg-332-\d+$/);
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseRentolaHtml (robustness)', () => {
  const card = (slug: string, title: string, address: string) => `
    <div class="relative flex overflow-hidden rounded-xl">
      <a class="relative w-40" href="/listings/${slug}">
        <img src="https://img2.rentola.com/x.webp" />
      </a>
      <div class="relative min-w-0 flex-1 p-2">
        <a class="absolute inset-0 z-1" href="/listings/${slug}"></a>
        <p>${title}</p>
        <p>${address}</p>
        <span>€1.100 / maand</span>
      </div>
    </div>`;

  it('returns [] for a page without cards', () => {
    expect(parseRentolaHtml('<html><body>leeg</body></html>')).toEqual([]);
  });

  it('deduplicates the multiple anchors per card and filters non-Delft', () => {
    const html =
      card('studio-teststraat-1-2611-aa-delft-pabc123', 'studio van 30 m²', 'Teststraat 1, 2611 AA Delft, Netherlands') +
      card('kamer-weg-2-3011-bb-rotterdam-pdef456', '1-slaapkamer kamer van 20 m²', 'Weg 2, 3011 BB Rotterdam, Netherlands');
    const listings = parseRentolaHtml(html);
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({
      externalId: 'pabc123',
      addressRaw: 'Teststraat 1, 2611 AA Delft',
      priceEur: 1100,
      surfaceM2: 30,
      propertyType: 'studio',
    });
  });
});
