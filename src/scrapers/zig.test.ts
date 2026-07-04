import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { normalize } from '../core/normalize.js';
import { composeMatchEmail, NO_LETTER_SOURCES } from '../core/notify.js';
import { parseZigJson } from './zig.js';

const woonnet = readFileSync('fixtures/woonnethaaglanden/latest.json', 'utf8');
const roommatch = readFileSync('fixtures/roommatch/latest.json', 'utf8');

describe('parseZigJson (fixtures)', () => {
  const wh = parseZigJson(woonnet, 'woonnet-haaglanden', 'https://www.woonnet-haaglanden.nl');
  const rm = parseZigJson(
    roommatch,
    'roommatch',
    'https://www.roommatch.nl',
    '/aanbod/studentenwoningen/details/',
  );

  it('keeps only Delft objects, sorted newest first', () => {
    expect(wh).toHaveLength(27);
    expect(rm).toHaveLength(13);
    for (const l of [...wh, ...rm]) expect(l.city).toBe('Delft');
    const dates = (JSON.parse(woonnet) as { result: Array<{ publicationDate?: string; city?: { name?: string } }> }).result
      .filter((o) => o.city?.name === 'Delft')
      .map((o) => o.publicationDate ?? '');
    expect(wh.length).toBe(dates.length);
  });

  it('parses price, full address and url for every object', () => {
    for (const l of [...wh, ...rm]) {
      expect(l.priceEur, l.externalId).toBeGreaterThan(100);
      expect(l.addressRaw, l.externalId).toMatch(/, (\d{4} [A-Z]{2} )?Delft$/);
      expect(l.url).toMatch(/\/aanbod\/(nu-te-huur\/te-huur|studentenwoningen)\/details\/.+/);
      expect(l.agency).toBeNull();
    }
  });

  it('parses a known woonnet object with real sleeping rooms', () => {
    const simons = wh.find((l) => l.addressRaw.startsWith('Simonsstraat 65'));
    expect(simons).toMatchObject({
      source: 'woonnet-haaglanden',
      externalId: '264864',
      addressRaw: 'Simonsstraat 65, 2628 TE Delft',
      priceEur: 719, // totalRent 718.92
      bedrooms: 2, // sleepingRoom.amountOfRooms — real bedrooms
      propertyType: 'house', // Benedenwoning
    });
    expect(normalize(simons!).dedupeKey).toMatch(/^simonsstraat-65-\d+$/);
  });

  it('returns [] for invalid JSON', () => {
    expect(parseZigJson('<h1>Not Allowed</h1>', 'roommatch', 'https://x')).toEqual([]);
  });
});

describe('inschrijfsysteem alerts (SOURCES.md #15/#16)', () => {
  const wh = parseZigJson(woonnet, 'woonnet-haaglanden', 'https://www.woonnet-haaglanden.nl');
  const profile = {
    name: 'Test',
    emails: ['t@example.com'],
    letterTemplate: 'Geachte {makelaar_of_verhuurder}, BRIEFTEKST',
    letterVars: {},
  };

  it('suppresses the application letter and instructs to log in', () => {
    expect(NO_LETTER_SOURCES.has('woonnet-haaglanden')).toBe(true);
    expect(NO_LETTER_SOURCES.has('roommatch')).toBe(true);
    const email = composeMatchEmail(normalize(wh[0]!), profile);
    expect(email.text).not.toContain('BRIEFTEKST');
    expect(email.text).not.toContain('Kopieer en plak');
    expect(email.text).toContain('inschrijfsysteem');
    expect(email.html).toContain('inschrijfduur of loting');
  });

  it('regular sources still get the letter', () => {
    const email = composeMatchEmail(
      normalize({ ...wh[0]!, source: 'pararius' }),
      profile,
    );
    expect(email.text).toContain('BRIEFTEKST');
  });
});
