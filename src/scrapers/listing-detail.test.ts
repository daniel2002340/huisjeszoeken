import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { extractJsonLdPostcode } from './listing-detail.js';
import { parsePdokPostcode } from './pdok.js';

const fixture = (path: string): string => readFileSync(`fixtures/${path}`, 'utf8');

describe('extractJsonLdPostcode', () => {
  it('finds the listing postcode on a huizenvinder detail page', () => {
    expect(extractJsonLdPostcode(fixture('huizenvinder/detail.html'))).toBe('2612 HR');
  });

  it('finds the Delft postcode on a huurstunt detail page, ignoring other-town teasers', () => {
    expect(extractJsonLdPostcode(fixture('huurstunt/detail.html'))).toBe('2628 SJ');
  });

  it('returns null on a buurtje detail page (only the company HQ address is present)', () => {
    expect(extractJsonLdPostcode(fixture('buurtje/detail.html'))).toBeNull();
  });

  it('returns null when the page has no JSON-LD at all', () => {
    expect(extractJsonLdPostcode('<html><body>niets</body></html>')).toBeNull();
  });
});

describe('parsePdokPostcode', () => {
  const body = fixture('pdok/adres.json');

  it('resolves a matching street + city to a formatted postcode', () => {
    expect(parsePdokPostcode(body, 'Mercuriusweg', 'Delft')).toBe('2624 BC');
  });

  it('refuses a postcode when the geocoder matched a different street', () => {
    expect(parsePdokPostcode(body, 'Vlamingstraat', 'Delft')).toBeNull();
  });

  it('refuses a postcode when the city differs', () => {
    expect(parsePdokPostcode(body, 'Mercuriusweg', 'Rijswijk')).toBeNull();
  });

  it('returns null on malformed JSON', () => {
    expect(parsePdokPostcode('not json', 'Mercuriusweg', 'Delft')).toBeNull();
  });
});
