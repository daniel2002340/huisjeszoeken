import * as cheerio from 'cheerio';

/**
 * Shared detail-page helpers for enrich() implementations (postcode filter +
 * cross-source dedupe — PLAN.md §2/§4).
 */

/**
 * The listing's own postcode from the page's JSON-LD blocks: the first
 * PostalAddress whose addressLocality matches the listing's city. Other
 * blocks on the same page (the company's own address, "recent listings"
 * teasers from other towns) carry different localities — verified on
 * huizenvinder and huurstunt detail fixtures. Returns "2612 HR" format.
 */
export function extractJsonLdPostcode(html: string, city = 'Delft'): string | null {
  const $ = cheerio.load(html);
  const found: string[] = [];

  const collect = (node: unknown): void => {
    if (Array.isArray(node)) {
      node.forEach(collect);
      return;
    }
    if (node === null || typeof node !== 'object') return;
    const obj = node as Record<string, unknown>;
    const locality = obj['addressLocality'];
    const postalCode = obj['postalCode'];
    if (
      typeof postalCode === 'string' &&
      typeof locality === 'string' &&
      locality.toLowerCase() === city.toLowerCase()
    ) {
      const match = postalCode.match(/^(\d{4})\s?([A-Za-z]{2})$/);
      if (match) found.push(`${match[1]} ${match[2]!.toUpperCase()}`);
    }
    Object.values(obj).forEach(collect);
  };

  $('script[type="application/ld+json"]').each((_, el) => {
    const text = $(el).text();
    try {
      collect(JSON.parse(text));
    } catch {
      // Some sites emit JSON-LD with trailing commas (huizenvinder). Retry
      // leniently; if that fails too, skip the block.
      try {
        collect(JSON.parse(text.replace(/,(\s*[}\]])/g, '$1')));
      } catch {
        // genuinely invalid JSON-LD — skip it
      }
    }
  });

  return found[0] ?? null;
}
