import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fetch } from 'undici';

/**
 * `pnpm fixture <source>` — fetch the live listing page ONCE with realistic
 * browser headers and save the raw HTML to fixtures/<source>/latest.html
 * (CLAUDE.md). Use sparingly; tests must run against these fixtures, never
 * against live sites.
 */
const SOURCE_URLS: Record<string, string> = {
  // Delft only, sorted newest-first (PLAN.md §3).
  pararius: 'https://www.pararius.nl/huurwoningen/delft',
  huurwoningen: 'https://www.huurwoningen.nl/in/delft/?ordering=newest',
  kamernet: 'https://kamernet.nl/huren/kamers-delft',
  funda: 'https://www.funda.nl/zoeken/huur?selected_area=%5B%22delft%22%5D&sort=%22date_down%22',
  // SOURCES.md #3: bounding box = Delft, sort=new already in the URL.
  huure:
    'https://huure.nl/huurwoning/delft?sw_lat=51.9665&sw_lng=4.31951&ne_lat=52.0326&ne_lng=4.40789&types=apartment_house&max_rent=1500&min_sqm_size=30&sort=new',
  // SOURCES.md #4: small local Delft agency site.
  appartementdelft: 'https://www.appartementdelft.nl/',
  // SOURCES.md #17: the HTML page is an empty widget shell; the data comes
  // from this internal JSON endpoint (found via the widget's data-url).
  bjornd: 'https://www.bjornd.nl/nl/realtime-listings/consumer',
  // SOURCES.md #18: listings are WP posts (category 26 = available rentals)
  // behind the standard WordPress REST API.
  oudedelft: 'https://oudedelft.com/wp-json/wp/v2/posts?categories=26&per_page=20&_embed=1',
  // SOURCES.md #6: MVGM's own portal; sort verified during adapter build.
  ikwilhuren: 'https://ikwilhuren.nu/aanbod/delft?sort=aanbodDESC',
  // SOURCES.md #8: no type filter on purpose — "Kamer / Studio" and
  // "Huurwoning" are separate type values that a type=Appartement URL drops.
  rentfinder: 'https://rentfinder.nl/properties?page=1&place=Delft',
  // SOURCES.md #9: no price filter available in the URL — matcher handles it.
  huislijn: 'https://www.huislijn.nl/huurwoning/nederland/zuid-holland/delft',
  // SOURCES.md #10: tracking params were stripped from the original URL.
  huizenvinder:
    'https://www.huizenvinder.nl/huren/delft/?types=studio%2Cappartement%2Chuurwoning&surface=40&max_price=1500',
  // SOURCES.md #19: default order is already "nieuw ➡️ oud". The original
  // min_surface param is ignored by the site (its real name is surface=);
  // dropped entirely — the matcher does per-profile surface filtering.
  rent: 'https://www.rent.nl/huurwoning/zuid-holland/delft/?min_price=0&max_price=1500',
  // SOURCES.md #20: partly paywalled platform; alert = card info + link.
  directwonen: 'https://directwonen.nl/huurwoningen-huren/delft',
  // SOURCES.md #21: national list; JSON endpoint / Delft filter checked
  // during adapter build.
  vbt: 'https://vbtverhuurmakelaars.nl/woningen',
  // SOURCES.md #22: private landlords; sorted newest via query params.
  marktplaats:
    'https://www.marktplaats.nl/l/huizen-en-kamers/huizen-te-huur/q/delft/?sortBy=SORT_INDEX&sortOrder=DECREASING',
  // SOURCES.md #11: aggregator; expect tier-1 overlap.
  huurstunt: 'https://www.huurstunt.nl/huren/delft/0-1500',
  // SOURCES.md #12: session-bound search_id param stripped; verified working.
  rentumo: 'https://rentumo.nl/huurwoningen?location=delft&sort_by=date_desc&rent=1500&size=41',
  // SOURCES.md #13: partly paywalled aggregator. All types (the original
  // appartement-only path would drop studios/kamers).
  rentola: 'https://rentola.nl/huren/delft',
  // SOURCES.md #14: the map's underlying GeoJSON endpoint (Delft bbox).
  // Requires a Referer header (see SOURCE_HEADERS below).
  buurtje:
    'https://api.buurtje.nl/api/wordpress/map-woningen.php?sw_lat=51.9665&sw_lng=4.31951&ne_lat=52.0326&ne_lng=4.40789&huurkoop=huur',
  // SOURCES.md #23: aggregator-of-aggregators; rooms_min dropped (would
  // exclude studios), order_by checked during build.
  trovit:
    'https://huizen.trovit.nl/search?type=2&text=delft&geo_id=R324269&price_max=1500&order_by=source_date',
  // SOURCES.md #7: group_ids=2650 = Delft selection (verified: all cards
  // Delft). sort=updated_at is the site's "Nieuwste" option.
  huurwoningportaal:
    'https://huurwoningportaal.nl/huurwoningen/?view=1&property_search%5Bgroup_ids%5D=2650&property_search%5Bproperty_type%5D%5B%5D=1&property_search%5Bproperty_type%5D%5B%5D=3&property_search%5Bproperty_type%5D%5B%5D=6&property_search%5Bmax_rate%5D=1500&property_search%5Bsort%5D=updated_at',
};

/** Extra headers some endpoints require (sent by a browser on the real site). */
const SOURCE_HEADERS: Record<string, Record<string, string>> = {
  buurtje: {
    Referer: 'https://buurtje.nl/',
    Origin: 'https://buurtje.nl',
    'Sec-Fetch-Site': 'same-site',
    'Sec-Fetch-Mode': 'cors',
    'Sec-Fetch-Dest': 'empty',
  },
};

const source = process.argv[2];
if (!source || !(source in SOURCE_URLS)) {
  console.error(`Usage: pnpm fixture <${Object.keys(SOURCE_URLS).join('|')}>`);
  process.exit(1);
}

const url = SOURCE_URLS[source]!;
console.log(`Fetching ${url} ...`);

const res = await fetch(url, {
  headers: {
    ...SOURCE_HEADERS[source],
    'User-Agent':
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36',
    Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
    'Accept-Language': 'nl-NL,nl;q=0.9,en;q=0.8',
    'Sec-Fetch-Dest': 'document',
    'Sec-Fetch-Mode': 'navigate',
    'Sec-Fetch-Site': 'none',
    'Upgrade-Insecure-Requests': '1',
  },
});

const html = await res.text();

if (!res.ok) {
  console.error(`HTTP ${res.status} ${res.statusText} — fixture NOT saved. First 2000 chars:`);
  console.error(html.slice(0, 2000));
  process.exit(1);
}

const dir = join('fixtures', source);
mkdirSync(dir, { recursive: true });
const isJson = (res.headers.get('content-type') ?? '').includes('json');
const file = join(dir, isJson ? 'latest.json' : 'latest.html');
writeFileSync(file, html);
console.log(`Saved ${html.length} bytes to ${file}`);
