import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseBuurtjeJson } from './buurtje.js';

// Trimmed real GeoJSON capture: 35 available Delft rentals + non-Delft and
// non-available features to exercise the filters.
const fixture = readFileSync('fixtures/buurtje/latest.json', 'utf8');

describe('parseBuurtjeJson (fixture)', () => {
  const listings = parseBuurtjeJson(fixture);

  it('keeps only available Delft features, sorted newest first', () => {
    const total = (JSON.parse(fixture) as { features: unknown[] }).features.length;
    expect(total).toBe(44);
    expect(listings).toHaveLength(35);
    for (const listing of listings) {
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses price, full address and url for every feature', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(100);
      expect(listing.addressRaw, listing.externalId).toMatch(/, Delft$/);
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/buurtje\.nl\/.+/);
    }
  });

  it('parses a known feature with a semantic dedupe key (street + number)', () => {
    const mercurius = listings.find((l) => l.addressRaw === 'Mercuriusweg 77, Delft');
    expect(mercurius).toMatchObject({
      priceEur: 1650,
      surfaceM2: 63,
      bedrooms: null, // "br" field deliberately not mapped
      propertyType: 'apartment',
      agency: '365Makelaardij',
    });
    expect(normalize(mercurius!).dedupeKey).toBe('mercuriusweg-77-66');
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      expect(normalize(listing).city).toBe('Delft');
    }
  });
});

describe('parseBuurtjeJson (robustness)', () => {
  it('returns [] for invalid JSON or missing features', () => {
    expect(parseBuurtjeJson('<html>403</html>')).toEqual([]);
    expect(parseBuurtjeJson('{"type":"FeatureCollection"}')).toEqual([]);
  });

  it('sorts by dt descending and drops gone listings', () => {
    const feature = (uk: string, dt: string, st = 'Beschikbaar') => ({
      properties: { uk, dt, st, wp: 'Delft', str: 'A', nr: '1', pr: 900, wt: 'Studio', sl: `/s/${uk}/` },
    });
    const listings = parseBuurtjeJson(
      JSON.stringify({
        features: [
          feature('old', '2026-07-01 10:00:00'),
          feature('gone', '2026-07-02 12:00:00', 'Verhuurd onder voorbehoud'),
          feature('new', '2026-07-02 11:00:00'),
        ],
      }),
    );
    expect(listings.map((l) => l.externalId)).toEqual(['new', 'old']);
  });
});
