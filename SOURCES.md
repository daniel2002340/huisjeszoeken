# SOURCES.md — Bronnen voor Delft rental alerts

Elke bron krijgt een eigen adapter (zie PLAN.md §3 en CLAUDE.md). Bouw ze per tier,
in batches van 2–3 per prompt. Status bijhouden in de tabel-kolom.

URL's zijn de exacte zoekpagina's die gepolld moeten worden. Als een bron een
"sorteer op nieuwste"-optie heeft die niet in de URL zit, voeg die toe (nieuwste
bovenaan pagina 1 is het hele mechanisme).

Let op: de meeste URL's hebben max €1500 / min m² al in de query. De matcher filtert
daarnaast alsnog per profiel — de URL-filters zijn alleen een grove voorselectie.

## Tier 1 — eerst bouwen (beste signaal / snelste bron)

| # | Bron | Status | URL | Notities |
|---|------|--------|-----|----------|
| 1 | pararius | ☑ | https://www.pararius.nl/huurwoningen/delft/0-1500 | Statisch HTML, rijkste data. Sorteer nieuwste. ⚠️ Sinds ~2026-07 Cloudflare-challenge voor elke plain-HTTP-client → fetch via headed Chromium (browser-fetch.ts). |
| 2 | huurwoningen.com | ☑ | https://www.huurwoningen.com/in/delft/?price=0-1500 | Statisch HTML. Zoek sort-parameter voor nieuwste. Gebouwd als huurwoningen.nl (zelfde platform). ⚠️ Sinds ~2026-07 Cloudflare-challenge → fetch via headed Chromium (browser-fetch.ts). |
| 3 | huure.nl | ☑ | https://huure.nl/huurwoning/delft?sw_lat=51.9665&sw_lng=4.31951&ne_lat=52.0326&ne_lng=4.40789&types=apartment_house&max_rent=1500&min_sqm_size=30&sort=new | Bounding box = Delft, sort=new zit al in URL. Bleek server-gerenderd (geen JSON-endpoint nodig). Kaarten tonen géén straatadres (alleen postcodedistrict) → unieke dedupe-key; bbox lekt buurgemeenten → adapter filtert op city == Delft. |
| 4 | appartementdelft.nl | ☑ | https://www.appartementdelft.nl/ | Lokale Delft-site — potentieel vroegste bron. Klein aanbod, simpele pagina. Kaarten bevatten ld+json (adres/kamers/m²/foto's); huisnummer staat alleen in de URL-slug. |
| 5 | funda | ☑ | https://www.funda.nl/zoeken/huur?selected_area=[%22delft%22]&price=%220-1500%22&object_type=[%22house%22,%22apartment%22]&sort=%22date_down%22 | Cloudflare → Playwright (PLAN.md fase 2a-procedure). Probeer eerst intern JSON-endpoint. Gebouwd via embedded __NUXT_DATA__ + plain fetch (headless browsers worden geblokkeerd). |
| 17 | bjornd.nl | ☑ | https://www.bjornd.nl/nl/huurwoningen?salesRentals=rentals | Lokale makelaar → vroege bron. ⚠️ De oorspronkelijke URL had alle filters in het #hash-fragment — dat wordt nooit naar de server gestuurd en is dus zinloos voor scraping (gestript). Bleek JSON-call: adapter gebruikt /nl/realtime-listings/consumer (hele portfolio) en filtert op isRentals + status ≠ Verhuurd + city == Delft. |
| 18 | oudedelft.com | ☑ | https://oudedelft.com/huur-2/ | Lokale Delftse makelaar → vroege bron. Listings zijn WP-posts: adapter gebruikt wp-json/wp/v2/posts?categories=26 (beschikbare huur); posts met categorie 11 (Verhuurd NL) worden geskipt. Prijs/slaapkamers/interieur uit vrije-tekst excerpt; titels zonder huisnummer → unieke dedupe-key. |

## Tier 2 — daarna

| # | Bron | Status | URL | Notities |
|---|------|--------|-----|----------|
| 6 | ikwilhuren.nu (MVGM) | ☑ | https://ikwilhuren.nu/aanbod/delft | Geverifieerd: server-gerenderd HTML (cheerio, geen Playwright). ?sort=aanbodDESC werkt (geverifieerd: volgorde wijkt af van default) → pagina 1 volstaat. Radius (+10km) is niet via GET te verkleinen (POST-formulier met CSRF) → adapter filtert op city == Delft. Eigen site van beheerder MVGM → potentieel vroege bron. |
| 7 | huurwoningportaal.nl | ☑ | https://huurwoningportaal.nl/huurwoningen/?view=1&property_search%5Bgroup_ids%5D=2650&property_search%5Bproperty_type%5D%5B%5D=1&property_search%5Bproperty_type%5D%5B%5D=3&property_search%5Bproperty_type%5D%5B%5D=6&property_search%5Bmax_rate%5D=1500&property_search%5Bsort%5D=updated_at | group_ids=2650 = Delft geverifieerd (alle kaarten Delft). sort=updated_at is de "Nieuwste"-optie van de site (popularity vervangen). Kaarten zonder huisnummer → unieke dedupe-key. |
| 8 | rentfinder.nl | ☑ | https://rentfinder.nl/properties?page=1&place=Delft | ⚠️ was: alleen appartementen. Geverifieerd: "Kamer / Studio" en "Huurwoning" zijn aparte type-waarden → type-filter uit de URL gehaald (alle types in één poll). Inertia.js: data als JSON in data-page-attribuut. Nieuwste staan op pagina 1 (geverifieerd via laatste pagina). |
| 9 | huislijn.nl | ☑ | https://www.huislijn.nl/huurwoning/nederland/zuid-holland/delft | Geen prijsfilter in URL — matcher vangt dat af. SSR embeddet elk object als JSON in :object-attribuut (incl. echte slaapkamers). Aggregator: deeplinks wijzen naar o.a. huurwoningen.nl. ⚠️ Sinds ~2026-07 Cloudflare-challenge → fetch via headed Chromium (browser-fetch.ts). |
| 10 | huizenvinder.nl | ☑ | https://www.huizenvinder.nl/huren/delft/?types=studio%2Cappartement%2Chuurwoning&surface=40&max_price=1500 | Tracking-parameters (gclid e.d.) verwijderd uit originele URL. Hele gefilterde aanbod op één pagina (geen paginering) → sortering irrelevant. Zelfde platform als appartementdelft.nl → overlap, dedupe vangt af. Kaarten zonder huisnummer → unieke dedupe-key. |
| 19 | rent.nl | ☑ | https://www.rent.nl/huurwoning/zuid-holland/delft/?min_price=0&max_price=1500 | Default sortering is al "nieuw ➡️ oud" (geen sort-param nodig). ⚠️ min_surface wordt door de site genegeerd (echte naam: surface=) → weggelaten, matcher filtert. Bron per kaart is geblurd en detail-link is signup-gated (/aanmelden/?id=) → alert = kaartinfo + die link. Type staat in HTML-comment na elke kaart. |
| 20 | directwonen.nl | ☑ | https://directwonen.nl/huurwoningen-huren/delft | Platform met deels betaalde toegang; alert = kaartinfo + link. Premium-gated kaarten dragen de echte detail-URL in de returnUrl-parameter → adapter pakt die uit. Verkorte straatnamen zonder huisnummer → unieke dedupe-key. |
| 21 | vbtverhuurmakelaars.nl | ☑ | https://vbtverhuurmakelaars.nl/woningen | ⚠️ was: landelijk zonder filter. Server-gerenderde Svelte-kaarten; /zoeken?q= is een leden-zoekfunctie (→ signup), dus geen server-side stadsfilter → adapter filtert op city == Delft. Pagina 1 is nieuwste-eerst (geverifieerd via reactie-tellers) → nieuwe Delft-listing verschijnt daar. Volledige huisnummers → semantische dedupe-keys. Momenteel geen Delft-aanbod (nieuwbouw-golven). |
| 22 | marktplaats.nl | ☑ | https://www.marktplaats.nl/l/huizen-en-kamers/huizen-te-huur/q/delft/?sortBy=SORT_INDEX&sortOrder=DECREASING | Particuliere verhuurders die nergens anders adverteren, maar ook véél scams. ⚠️ Vaste scam-waarschuwing in alerts van deze bron: geïmplementeerd (SOURCE_WARNINGS in notify.ts). Next.js: data in __NEXT_DATA__; plain fetch werkte bij bouw (geen bot-wall) — bij uitval vangt de backoff het af. q-zoek matcht ook verkopers elders → adapter filtert op "Delft" in titel. Geen straatadres → unieke dedupe-key. |

## Tier 3 — aggregators van aggregators (veel duplicaten; dedupe vangt dit af)

| # | Bron | Status | URL | Notities |
|---|------|--------|-----|----------|
| 11 | huurstunt.nl | ☑ | https://www.huurstunt.nl/huren/delft/0-1500 | Aggregator; verwacht veel overlap met tier 1. Server-gerenderde kaarten (naast skeleton-placeholders die de adapter overslaat). Straat zonder huisnummer → unieke dedupe-key. |
| 12 | rentumo.nl | ☑ | https://rentumo.nl/huurwoningen?location=delft&sort_by=date_desc&rent=1500&size=41 | Aggregator die zelf scrapet. Geverifieerd: URL werkt zonder search_id en date_desc is actief. Kaarttitel is alleen de stad; straat+huisnummer zit in de detail-slug → adapter reconstrueert adres (semantische dedupe-key!). Foto's lazy via data-src. |
| 13 | rentola.nl | ☑ | https://rentola.nl/huren/delft | Aggregator, details deels achter betaalmuur. Originele link staat niet op de kaart → alert linkt naar rentola. URL gewijzigd naar alle types (appartement-pad zou studio's/kamers missen). Kaarten hebben vol adres + echte slaapkamer-aantallen → semantische dedupe-keys. |
| 14 | buurtje.nl | ☑ | https://buurtje.nl/kaart/?gwb=GM0503&type=huur | ⚠️ was: kaartweergave. JSON-endpoint gevonden: api.buurtje.nl/api/wordpress/map-woningen.php met Delft-bbox + huurkoop=huur (vereist Referer-header). Vol adres + dt-timestamp (nieuwste eerst) → semantische dedupe-keys. "br"-veld is géén slaapkamer-aantal → genegeerd. |
| 23 | huizen.trovit.nl | ☑ | https://huizen.trovit.nl/search?type=2&text=delft&geo_id=R324269&price_max=1500&order_by=source_date | Aggregator-van-aggregators, vrijwel alleen duplicaten. order_by=source_date geverifieerd ("nieuw"-badges bovenaan). rooms_min=2 verwijderd (sloot studio's uit). Kaarten zonder adres; links zijn sessie-gebonden clk.thribee.com-redirects (enige link die de site biedt). Bronportaal per kaart → agency-veld. |

## Apart geval — inschrijfsystemen (geen snelheidsspel, wel handig)

| # | Bron | Status | URL | Notities |
|---|------|--------|-----|----------|
| 15 | woonnet-haaglanden | ☑ | https://www.woonnet-haaglanden.nl/aanbod/nu-te-huur/te-huur#?gesorteerd-op=prijs%2B&locatie=Gemeente%2BDelft | Sociale huur/corporaties. ZIG/Hexia-portal: JSON via POST /portal/object/frontend/getallobjects/format/json (geen Playwright nodig). Alert is informatief zonder brief (NO_LETTER_SOURCES in notify.ts). Rustiger gepolld (5 min). |
| 16 | roommatch.nl | ☑ | https://www.roommatch.nl/aanbod/studentenwoningen#?gesorteerd-op=prijs%2B&locatie=Delft-Delft-Regio%2BHaaglanden%252F%2BLeiden | Studentenhuisvesting (DUWO), zelfde ZIG-endpoint als #15, zelfde brief-loze alert. Alleen relevant als de vrienden student zijn. |

## Verwijderd uit de oorspronkelijke lijst
- rentumo stond er dubbel in (identieke URL 2×).
- Tracking-parameters gestript: `fbclid` (appartementdelft), `gclid`/`gad_*`/`gbraid` (huizenvinder).
- bjornd.nl: het volledige #hash-fragment met filters gestript — hash-fragmenten worden nooit naar de server gestuurd en doen dus niets bij scraping.
- trovit: `order_by=relevance` vervangen (relevantie-sortering is onbruikbaar voor nieuw-aanbod-detectie).
