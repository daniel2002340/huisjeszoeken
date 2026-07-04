import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { parseExcerptPrice, parseOudedelftJson } from './oudedelft.js';

// Trimmed real capture of the WP REST posts endpoint (category 26), including
// two posts that also carry the Verhuurd category (11).
const fixture = readFileSync('fixtures/oudedelft/latest.json', 'utf8');

describe('parseOudedelftJson (fixture)', () => {
  const listings = parseOudedelftJson(fixture);

  it('skips rented posts (Verhuurd category OR marked in the excerpt text)', () => {
    const posts = JSON.parse(fixture) as Array<{
      categories: number[];
      excerpt: { rendered: string };
    }>;
    const rented = posts.filter(
      (p) => p.categories.includes(11) || /verhuurd|rented\s*out/i.test(p.excerpt.rendered),
    ).length;
    expect(rented).toBeGreaterThanOrEqual(2); // fixture contains both variants
    expect(listings).toHaveLength(posts.length - rented);
  });

  it('parses address and url for every post, price where the excerpt has one', () => {
    for (const listing of listings) {
      expect(listing.addressRaw, listing.externalId).toBeTruthy();
      expect(listing.url, listing.externalId).toMatch(/^https:\/\/oudedelft\.com\/.+/);
    }
    const withPrice = listings.filter((l) => l.priceEur !== null);
    // Free-form excerpts: most posts state a price, unknown passes the matcher.
    expect(withPrice.length).toBeGreaterThan(listings.length / 2);
    for (const listing of withPrice) {
      expect(listing.priceEur).toBeGreaterThan(200);
    }
  });

  it('parses the known first post completely', () => {
    expect(listings[0]).toEqual({
      source: 'oudedelft',
      externalId: '14552',
      url: 'https://oudedelft.com/kloksteeg-b/',
      addressRaw: 'Kloksteeg B', // street only — no house number on the index
      priceEur: 1372,
      surfaceM2: null,
      bedrooms: 1,
      propertyType: 'unknown',
      furnished: 'unfurnished',
      agency: 'Oude Delft Makelaardij',
      imageUrl: 'https://oudedelft.com/wp-content/uploads/2022/03/DSC_0159.jpg',
      city: null,
    });
  });

  it('every parsed listing passes normalize with a safe dedupe key', () => {
    for (const listing of listings) {
      const normalized = normalize(listing);
      // Titles usually lack house numbers ("Kloksteeg B" -> unique key), but
      // some do carry one ("Delftweg 34C" -> semantic cross-source key).
      expect(normalized.dedupeKey).toMatch(
        new RegExp(`^(u-oudedelft-${listing.externalId}|[a-z0-9]+-\\d+[a-z]?-(\\d+|x))$`),
      );
    }
    // The common case stays listing-unique:
    expect(normalize(listings[0]!).dedupeKey).toBe(`u-oudedelft-${listings[0]!.externalId}`);
  });
});

describe('excerpt parsing', () => {
  it.each([
    ['1 bedroom – €1.372 incl. – unfurnished', 1372],
    ['Available from 01-07-2026 – furnished – 1.700 excl.g/w/e', 1700],
    ['Available 01-07-2026 | 1 slaapkamer – 30 m2 – €1.350,- incl. gemeubileerd', 1350],
    ['appartement 2/2 – € 1,700 – 01-10-2025', 1700], // comma thousands separator
    ['2 slaapkamers – € 2,000 excl. g/w/e.', 2000],
    ['1 bedroom – 30m2 – €1353,25 incl. – furnished', 1353], // comma decimals
    ['Studio – € 750 – furnished', 750],
    ['Available from 01-07-2026', null], // date must never parse as a price
  ])('parses price from %j', (excerpt, expected) => {
    expect(parseExcerptPrice(excerpt)).toBe(expected);
  });

  it('parses bedrooms, surface and furnished from mixed-language excerpts', () => {
    const post = (excerpt: string) =>
      parseOudedelftJson(
        JSON.stringify([
          {
            id: 1,
            link: 'https://oudedelft.com/test/',
            title: { rendered: 'Teststraat' },
            excerpt: { rendered: `<p>${excerpt}</p>` },
            categories: [26],
          },
        ]),
      )[0];

    expect(post('2 slaapkamers – 45 m2 – €1.100 – gemeubileerd')).toMatchObject({
      bedrooms: 2,
      surfaceM2: 45,
      priceEur: 1100,
      furnished: 'furnished',
    });
    expect(post('1 bedroom – unfurnished')).toMatchObject({
      bedrooms: 1,
      surfaceM2: null,
      furnished: 'unfurnished',
    });
    expect(post('Beschikbaar per direct')).toMatchObject({
      bedrooms: null,
      priceEur: null,
      furnished: 'unknown',
    });
  });

  it('returns [] for invalid JSON', () => {
    expect(parseOudedelftJson('<html>error page</html>')).toEqual([]);
  });
});
