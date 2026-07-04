// Diagnostic: per source, how many fixture listings yield a parseable
// postcode (matcher can district-filter) vs null (passes any postcode filter).
import { readdirSync, readFileSync } from 'node:fs';
import { normalize } from '../src/core/normalize.js';
import type { RawListing } from '../src/core/types.js';

const load = (source: string): string => {
  const dir = `fixtures/${source}`;
  const file = readdirSync(dir).find((f) => !f.startsWith('.'));
  return readFileSync(`${dir}/${file}`, 'utf8');
};

const parsers: Record<string, (input: string) => RawListing[]> = {
  appartementdelft: (await import('../src/scrapers/appartementdelft.js')).parseAppartementDelftHtml,
  bjornd: (await import('../src/scrapers/bjornd.js')).parseBjorndJson,
  buurtje: (await import('../src/scrapers/buurtje.js')).parseBuurtjeJson,
  directwonen: (await import('../src/scrapers/directwonen.js')).parseDirectwonenHtml,
  funda: (await import('../src/scrapers/funda.js')).parseFundaHtml,
  huislijn: (await import('../src/scrapers/huislijn.js')).parseHuislijnHtml,
  huizenvinder: (await import('../src/scrapers/huizenvinder.js')).parseHuizenvinderHtml,
  huure: (await import('../src/scrapers/huure.js')).parseHuureHtml,
  huurstunt: (await import('../src/scrapers/huurstunt.js')).parseHuurstuntHtml,
  huurwoningen: (await import('../src/scrapers/huurwoningen.js')).parseHuurwoningenHtml,
  huurwoningportaal: (await import('../src/scrapers/huurwoningportaal.js')).parseHuurwoningportaalHtml,
  ikwilhuren: (await import('../src/scrapers/ikwilhuren.js')).parseIkwilhurenHtml,
  marktplaats: (await import('../src/scrapers/marktplaats.js')).parseMarktplaatsHtml,
  oudedelft: (await import('../src/scrapers/oudedelft.js')).parseOudedelftJson,
  pararius: (await import('../src/scrapers/pararius.js')).parseParariusHtml,
  rent: (await import('../src/scrapers/rent.js')).parseRentHtml,
  rentfinder: (await import('../src/scrapers/rentfinder.js')).parseRentfinderHtml,
  rentola: (await import('../src/scrapers/rentola.js')).parseRentolaHtml,
  rentumo: (await import('../src/scrapers/rentumo.js')).parseRentumoHtml,
  trovit: (await import('../src/scrapers/trovit.js')).parseTrovitHtml,
  vbt: (await import('../src/scrapers/vbt.js')).parseVbtHtml,
};

const rows: string[] = [];
for (const [source, parse] of Object.entries(parsers)) {
  try {
    const listings = parse(load(source)).map((raw) => {
      try { return normalize(raw); } catch { return null; }
    }).filter((l) => l !== null);
    const withPc = listings.filter((l) => l.postcode !== null).length;
    const sample = listings.find((l) => l.postcode === null);
    rows.push(
      `${source.padEnd(18)} ${String(withPc).padStart(3)}/${String(listings.length).padEnd(3)} postcode` +
        (sample ? `   e.g. no-pc addressRaw: "${sample.addressRaw}"` : ''),
    );
  } catch (error) {
    rows.push(`${source.padEnd(18)} ERROR: ${String(error).slice(0, 100)}`);
  }
}
console.log(rows.join('\n'));
