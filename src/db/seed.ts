import { eq } from 'drizzle-orm';
import { db } from './client.js';
import { profiles } from './schema.js';

// Letter template from PLAN.md §4.
const LETTER_TEMPLATE = `Geachte {makelaar_of_verhuurder},

Met veel interesse zagen wij de woning aan de {adres} in Delft.
{intro_blurb}

{inkomen_zin}
Wij kunnen per direct reageren en zijn flexibel voor een bezichtiging.

Met vriendelijke groet,
{namen}
{telefoon}`;

const EXAMPLE_PROFILE = {
  name: 'Anna & Tom',
  emails: ['anna@example.com', 'tom@example.com'],
  minPrice: 900,
  maxPrice: 1500,
  minBedrooms: null,
  minSurfaceM2: null,
  propertyTypes: ['apartment', 'studio'],
  furnishedPref: 'any',
  letterTemplate: LETTER_TEMPLATE,
  letterVars: {
    namen: 'Anna de Vries & Tom Jansen',
    telefoon: '06 12345678',
    intro_blurb:
      'Wij zijn een rustig, werkend stel (beiden 28) en zoeken per direct een woning in Delft.',
    inkomen_zin:
      'Ons gezamenlijk bruto maandinkomen is €5.400 en wij hebben vaste contracten; een werkgeversverklaring sturen wij graag mee.',
  },
  active: true,
} as const;

const existing = db.select().from(profiles).where(eq(profiles.name, EXAMPLE_PROFILE.name)).get();
if (existing) {
  console.log(`Seed profile "${EXAMPLE_PROFILE.name}" already exists (id ${existing.id}) — skipping.`);
} else {
  const inserted = db
    .insert(profiles)
    .values({ ...EXAMPLE_PROFILE, emails: [...EXAMPLE_PROFILE.emails], propertyTypes: [...EXAMPLE_PROFILE.propertyTypes], letterVars: { ...EXAMPLE_PROFILE.letterVars } })
    .returning()
    .get();
  console.log(`Seeded example profile "${inserted.name}" (id ${inserted.id}).`);
}
