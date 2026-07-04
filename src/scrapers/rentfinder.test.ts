import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseRentfinderHtml } from './rentfinder.js';

const fixture = readFileSync('fixtures/rentfinder/latest.html', 'utf8');

describe('parseRentfinderHtml (fixture)', () => {
  const listings = parseRentfinderHtml(fixture);

  it('parses all page-1 listings from the Inertia payload', () => {
    expect(listings).toHaveLength(9); // per_page of the site
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('includes non-apartment types (the reason the type filter was dropped)', () => {
    const types = new Set(listings.map((l) => l.propertyType));
    expect(types.size).toBeGreaterThan(1);
    expect(types).toContain('apartment');
  });

  it('parses price, address and url for every listing', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/rentfinder\.nl\/properties\/.+/);
      expect(listing.externalId).toMatch(/^\d+$/);
    }
  });

  it('parses the known first listing completely (string-typed numerics)', () => {
    expect(listings[0]).toEqual({
      source: 'rentfinder',
      externalId: '338762',
      url: 'https://rentfinder.nl/properties/te-huur-2-kamer-appartement-charlotte-de-bourbonstraat-in-delft-1',
      addressRaw: 'Charlotte de Bourbonstraat, Delft',
      priceEur: 850, // "850" in the payload
      surfaceM2: 41,
      bedrooms: 1, // real bedroom count from bed_rooms
      propertyType: 'apartment',
      furnished: 'shell', // delivery: Kaal
      agency: null,
      imageUrl: expect.stringMatching(/^https:\/\/.+\.jpg$/),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      expect(normalized.dedupeKey).toBeTruthy();
    }
  });
});

describe('parseRentfinderHtml (robustness)', () => {
  const page = (properties: unknown[]) =>
    `<div id="app" data-page="${JSON.stringify({ props: { properties: { data: properties } } })
      .replaceAll('&', '&amp;')
      .replaceAll('"', '&quot;')}"></div>`;

  it('returns [] without a payload or with corrupt JSON', () => {
    expect(parseRentfinderHtml('<html><body></body></html>')).toEqual([]);
    expect(parseRentfinderHtml('<div id="app" data-page="{oops"></div>')).toEqual([]);
  });

  it('maps the combined "Kamer / Studio" type via the title', () => {
    const [studio, kamer] = parseRentfinderHtml(
      page([
        { id: 1, slug: 's-1', title: 'Te Huur Studio Oude Delft', type: 'Kamer / Studio', place: 'Delft' },
        { id: 2, slug: 'k-1', title: 'Te Huur Kamer Brabantse Turfmarkt', type: 'Kamer / Studio', place: 'Delft' },
      ]),
    );
    expect(studio?.propertyType).toBe('studio');
    expect(kamer?.propertyType).toBe('room');
  });

  it('drops non-Delft places and delivery maps to furnished', () => {
    const listings = parseRentfinderHtml(
      page([
        { id: 1, slug: 'x', title: 't', type: 'Appartement', place: 'Rotterdam' },
        {
          id: 2,
          slug: 'y',
          title: 't',
          type: 'Huurwoning',
          place: 'Delft',
          property_details: { delivery: 'Gemeubileerd' },
        },
      ]),
    );
    expect(listings).toHaveLength(1);
    expect(listings[0]).toMatchObject({ propertyType: 'house', furnished: 'furnished' });
  });
});
