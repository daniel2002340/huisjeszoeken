import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { composeMatchEmail, SOURCE_WARNINGS } from '../core/notify.js';
import { parseMarktplaatsHtml } from './marktplaats.js';

const fixture = readFileSync('fixtures/marktplaats/latest.html', 'utf8');

describe('parseMarktplaatsHtml (fixture)', () => {
  const listings = parseMarktplaatsHtml(fixture);

  it('parses the page-1 listings (Delft in title, not reserved)', () => {
    expect(listings.length).toBeGreaterThan(20);
    for (const listing of listings) {
      expect(listing.addressRaw.toLowerCase(), listing.externalId).toContain('delft');
      expect(listing.city).toBe('Delft');
    }
  });

  it('parses url and marktplaats item ids for every listing', () => {
    for (const listing of listings) {
      expect(listing.externalId).toMatch(/^[am]\d+$/); // a… organic, m… admarkt ads
      expect(listing.url, listing.externalId).toMatch(
        /^https:\/\/www\.marktplaats\.nl\/v\/huizen-en-kamers\/huizen-te-huur\/.+/,
      );
    }
  });

  it('parses the known first listing completely (surface from title fallback)', () => {
    expect(listings[0]).toEqual({
      source: 'marktplaats',
      externalId: 'a1527255278',
      url: 'https://www.marktplaats.nl/v/huizen-en-kamers/huizen-te-huur/a1527255278-appartement-te-huur-in-delft-40-m2-1-kamer-s',
      addressRaw: 'Appartement te huur in Delft - 40 m² - 1 kamer(s)', // private ads: no street
      priceEur: 1167, // priceCents 116700
      surfaceM2: 40, // from the title; livingArea attribute missing here
      bedrooms: 0, // 1 kamer -> 0 separate bedrooms
      propertyType: 'apartment',
      furnished: 'unknown',
      agency: 'Huurzone',
      imageUrl: expect.stringMatching(/^https:\/\//),
      city: 'Delft',
    });
  });

  it('every parsed listing passes normalize with a listing-unique dedupe key', () => {
    for (const listing of listings) {
      expect(normalize(listing).dedupeKey).toBe(`u-marktplaats-${listing.externalId}`);
    }
  });

  it('alerts from this source carry the scam warning (SOURCES.md ⚠️)', () => {
    const email = composeMatchEmail(normalize(listings[0]!), {
      name: 'Test',
      emails: ['t@example.com'],
      letterTemplate: 'Geachte {makelaar_of_verhuurder}',
      letterVars: {},
    });
    expect(SOURCE_WARNINGS['marktplaats']).toBeTruthy();
    expect(email.text).toContain('oplichting');
    expect(email.text).toContain('NOOIT');
    expect(email.html).toContain('oplichting');
  });
});

describe('parseMarktplaatsHtml (robustness)', () => {
  const page = (items: unknown[]) =>
    `<script id="__NEXT_DATA__" type="application/json">${JSON.stringify({
      props: { pageProps: { searchRequestAndResponse: { listings: items } } },
    })}</script>`;

  const base = {
    itemId: 'a1',
    title: 'Studio te huur in Delft',
    vipUrl: '/v/huizen-en-kamers/huizen-te-huur/a1-studio',
    priceInfo: { priceCents: 90000, priceType: 'FIXED' },
  };

  it('returns [] without payload (bot wall) or with corrupt JSON', () => {
    expect(parseMarktplaatsHtml('<html><body>blocked</body></html>')).toEqual([]);
    expect(
      parseMarktplaatsHtml('<script id="__NEXT_DATA__" type="application/json">{oops</script>'),
    ).toEqual([]);
  });

  it('drops reserved items, non-Delft titles, and non-FIXED prices become null', () => {
    const listings = parseMarktplaatsHtml(
      page([
        base,
        { ...base, itemId: 'a2', reserved: true },
        { ...base, itemId: 'a3', title: 'Kamer in Rotterdam' },
        { ...base, itemId: 'a4', priceInfo: { priceCents: 90000, priceType: 'NOTK' } },
      ]),
    );
    expect(listings.map((l) => l.externalId)).toEqual(['a1', 'a4']);
    expect(listings[0]?.priceEur).toBe(900);
    expect(listings[1]?.priceEur).toBeNull();
    expect(listings[0]?.propertyType).toBe('studio');
  });

  it('detects furnished from title/description text', () => {
    const [l] = parseMarktplaatsHtml(
      page([{ ...base, description: 'Volledig gemeubileerde studio.' }]),
    );
    expect(l?.furnished).toBe('furnished');
  });
});
