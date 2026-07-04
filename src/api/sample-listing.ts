import type { Listing } from '../core/types.js';

/**
 * Sample listing for the letter-template live preview (PLAN.md §6). The agency
 * is intentionally unknown so the preview shows the heer/mevrouw fallback.
 */
export const SAMPLE_LISTING: Listing = {
  source: 'pararius',
  externalId: 'sample',
  url: 'https://www.pararius.nl/appartement-te-huur/delft/sample/voorstraat',
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
  agency: null,
  imageUrl: null,
  dedupeKey: 'voorstraat-12-58',
};
