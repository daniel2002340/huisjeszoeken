import { describe, expect, it } from 'vitest';
import { renderApplicationLetter } from './letter.js';
import { buildSubject, composeMatchEmail, type NotifyProfile } from './notify.js';
import type { Listing } from './types.js';

const listing = (overrides: Partial<Listing> = {}): Listing => ({
  source: 'pararius',
  externalId: 'abc123',
  url: 'https://www.pararius.nl/appartement-te-huur/delft/abc123/voorstraat',
  addressRaw: 'Voorstraat 12, 2611 JK Delft',
  street: 'Voorstraat',
  houseNo: '12',
  postcode: '2611 JK',
  city: 'Delft',
  priceEur: 1450,
  surfaceM2: 62,
  bedrooms: 2,
  propertyType: 'apartment',
  furnished: 'unfurnished',
  agency: 'Maison Makelaars',
  imageUrl: 'https://example.com/photo.jpg',
  dedupeKey: 'voorstraat-12-58',
  ...overrides,
});

const profile: NotifyProfile = {
  name: 'Anna & Tom',
  emails: ['anna@example.com', 'tom@example.com'],
  letterTemplate: [
    'Geachte {makelaar_of_verhuurder},',
    '',
    'Met veel interesse zagen wij de woning aan de {adres} in Delft.',
    '{intro_blurb}',
    '',
    'Met vriendelijke groet,',
    '{namen}',
    '{telefoon}',
  ].join('\n'),
  letterVars: {
    namen: 'Anna de Vries & Tom Jansen',
    telefoon: '06 12345678',
    intro_blurb: 'Wij zijn een rustig, werkend stel en zoeken per direct.',
  },
};

describe('buildSubject', () => {
  it('matches the PLAN.md §5 format exactly', () => {
    expect(buildSubject(listing())).toBe(
      '🏠 €1.450 — Voorstraat 12, Delft (62 m², 2 slk) — Pararius',
    );
  });

  it('omits unknown details gracefully', () => {
    expect(buildSubject(listing({ surfaceM2: null, bedrooms: null }))).toBe(
      '🏠 €1.450 — Voorstraat 12, Delft — Pararius',
    );
    expect(buildSubject(listing({ bedrooms: null }))).toBe(
      '🏠 €1.450 — Voorstraat 12, Delft (62 m²) — Pararius',
    );
    expect(buildSubject(listing({ priceEur: null }))).toBe(
      '🏠 prijs onbekend — Voorstraat 12, Delft (62 m², 2 slk) — Pararius',
    );
  });
});

describe('renderApplicationLetter', () => {
  it('fills listing-derived placeholders and letter_vars', () => {
    const letter = renderApplicationLetter(listing(), profile);
    expect(letter).toContain('Geachte Maison Makelaars,');
    expect(letter).toContain('de woning aan de Voorstraat 12 in Delft');
    expect(letter).toContain('Anna de Vries & Tom Jansen');
  });

  it('falls back to heer/mevrouw when the agency is unknown (§4)', () => {
    const letter = renderApplicationLetter(listing({ agency: null }), profile);
    expect(letter).toContain('Geachte heer/mevrouw,');
  });

  it('leaves a missing letter_var visible instead of dropping it silently', () => {
    const letter = renderApplicationLetter(listing(), {
      ...profile,
      letterVars: { namen: 'Anna & Tom' },
    });
    expect(letter).toContain('{telefoon}');
  });
});

describe('composeMatchEmail', () => {
  const email = composeMatchEmail(listing(), profile);

  it('addresses all profile recipients', () => {
    expect(email.to).toEqual(['anna@example.com', 'tom@example.com']);
  });

  it('renders the full email (snapshot)', () => {
    expect(email).toMatchSnapshot();
  });

  it('escapes HTML in scraped values', () => {
    const sneaky = composeMatchEmail(
      listing({ agency: 'Evil <script>alert(1)</script> BV' }),
      profile,
    );
    expect(sneaky.html).not.toContain('<script>alert');
    expect(sneaky.html).toContain('Evil &lt;script&gt;');
  });
});
