import { describe, expect, it } from 'vitest';
import { checkDuplicate, createInMemoryLookup } from './dedupe.js';
import { normalize } from './normalize.js';
import type { RawListing } from './types.js';

const raw = (overrides: Partial<RawListing> = {}): RawListing => ({
  source: 'pararius',
  externalId: 'voorstraat-12-delft',
  url: 'https://www.pararius.nl/appartement-te-huur/delft/voorstraat-12',
  addressRaw: 'Voorstraat 12, 2611 JK Delft',
  priceEur: 1450,
  ...overrides,
});

describe('checkDuplicate', () => {
  it('flags the same source + external_id as duplicate', () => {
    const existing = normalize(raw());
    const candidate = normalize(raw({ priceEur: 1500, addressRaw: 'Voorstraat 12' }));

    const verdict = checkDuplicate(candidate, createInMemoryLookup([existing]));
    expect(verdict).toMatchObject({ isDuplicate: true, reason: 'same-source' });
  });

  it('flags a cross-source listing with the same address + price as duplicate', () => {
    const existing = normalize(raw());
    const candidate = normalize(
      raw({
        source: 'huurwoningen',
        externalId: '98765',
        url: 'https://www.huurwoningen.nl/huren/delft/98765/',
        addressRaw: 'Voorstraat 12', // same address, formatted differently
      }),
    );

    const verdict = checkDuplicate(candidate, createInMemoryLookup([existing]));
    expect(verdict).toMatchObject({ isDuplicate: true, reason: 'cross-source' });
    if (verdict.isDuplicate) {
      expect(verdict.existing.source).toBe('pararius');
    }
  });

  it('flags a cross-source price just inside the €25 bucket as duplicate', () => {
    // 1450 and 1462 both round(price/25) to bucket 58.
    const existing = normalize(raw({ priceEur: 1450 }));
    const candidate = normalize(
      raw({ source: 'huurwoningen', externalId: '98765', priceEur: 1462 }),
    );

    const verdict = checkDuplicate(candidate, createInMemoryLookup([existing]));
    expect(verdict).toMatchObject({ isDuplicate: true, reason: 'cross-source' });
  });

  it('does not flag a price just outside the €25 bucket', () => {
    // 1450 -> bucket 58, 1463 -> bucket 59: same address, different bucket.
    const existing = normalize(raw({ priceEur: 1450 }));
    const candidate = normalize(
      raw({ source: 'huurwoningen', externalId: '98765', priceEur: 1463 }),
    );

    const verdict = checkDuplicate(candidate, createInMemoryLookup([existing]));
    expect(verdict).toEqual({ isDuplicate: false });
  });

  it('does not flag a different address on another source', () => {
    const existing = normalize(raw());
    const candidate = normalize(
      raw({ source: 'huurwoningen', externalId: '98765', addressRaw: 'Achterom 3, Delft' }),
    );

    const verdict = checkDuplicate(candidate, createInMemoryLookup([existing]));
    expect(verdict).toEqual({ isDuplicate: false });
  });
});
