import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseBjorndJson } from './bjornd.js';

// Trimmed real capture of /nl/realtime-listings/consumer: all 8 available
// Delft rentals plus rented/sales/other-city objects to exercise the filters.
const fixture = readFileSync('fixtures/bjornd/latest.json', 'utf8');

describe('parseBjorndJson (fixture)', () => {
  const listings = parseBjorndJson(fixture);

  it('keeps only available Delft rentals', () => {
    const all = JSON.parse(fixture) as Array<Record<string, unknown>>;
    expect(all.length).toBeGreaterThan(listings.length); // filters do something
    expect(listings).toHaveLength(8);
  });

  it('parses price, address and url for every listing', () => {
    for (const listing of listings) {
      expect(listing.priceEur, listing.externalId).toBeGreaterThan(200);
      expect(listing.addressRaw, listing.externalId).toMatch(/, \d{4} [A-Z]{2} Delft$/);
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.bjornd\.nl\/nl\/woningaanbod\/details\/.+/,
      );
      expect(listing.city).toBe('Delft');
    }
  });

  it('sorts newest first (by added timestamp)', () => {
    const raw = (JSON.parse(fixture) as Array<{ url?: string; added?: number }>).filter(Boolean);
    const addedByUrl = new Map(raw.map((o) => [o.url, o.added ?? 0]));
    const timestamps = listings.map((l) => addedByUrl.get(new URL(l.url).pathname) ?? 0);
    expect([...timestamps].sort((a, b) => b - a)).toEqual(timestamps);
  });

  it('parses a known listing completely', () => {
    const burgwal = listings.find((l) => l.addressRaw.startsWith('Burgwal 25 H'));
    expect(burgwal).toMatchObject({
      source: 'bjornd',
      addressRaw: 'Burgwal 25 H, 2611 GE Delft',
      priceEur: 875,
      surfaceM2: 29,
      bedrooms: 1,
      propertyType: 'apartment',
      furnished: 'furnished',
      agency: 'Bjornd Makelaardij',
    });
  });

  it('cross-source dedupe key matches the same unit on pararius', () => {
    // Burgwal 25 H (€875) is also in the pararius fixture — the whole point
    // of the semantic dedupe key.
    const burgwal = listings.find((l) => l.addressRaw.startsWith('Burgwal 25 H'));
    expect(normalize(burgwal!).dedupeKey).toBe('burgwal-25h-35');
  });

  it('every parsed listing passes normalize', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      expect(normalized.city).toBe('Delft');
      expect(normalized.postcode).toMatch(/^\d{4} [A-Z]{2}$/);
    }
  });
});

describe('parseBjorndJson (robustness)', () => {
  it('returns [] for invalid or non-array JSON', () => {
    expect(parseBjorndJson('not json')).toEqual([]);
    expect(parseBjorndJson('{"a":1}')).toEqual([]);
  });

  it('maps interior flags to furnished values', () => {
    const base = {
      url: '/nl/woningaanbod/details/test-1/abc',
      address: 'Teststraat 1',
      zipcode: '2611 AA',
      city: 'Delft',
      isRentals: true,
      status: 'Beschikbaar',
    };
    const parse = (flags: Record<string, boolean>) =>
      parseBjorndJson(JSON.stringify([{ ...base, ...flags }]))[0]?.furnished;
    expect(parse({ isFurnished: true })).toBe('furnished');
    expect(parse({ isDecorated: true })).toBe('unfurnished');
    expect(parse({ isShell: true })).toBe('shell');
    expect(parse({})).toBe('unknown');
  });
});
