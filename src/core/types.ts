import { z } from 'zod';

export const PROPERTY_TYPES = ['apartment', 'studio', 'room', 'house', 'unknown'] as const;
export type PropertyType = (typeof PROPERTY_TYPES)[number];

export const FURNISHED_VALUES = ['furnished', 'unfurnished', 'shell', 'unknown'] as const;
export type Furnished = (typeof FURNISHED_VALUES)[number];

/**
 * What a scraper adapter returns for one listing card. Scraped data is external
 * input, so it is zod-validated before normalization (CLAUDE.md).
 */
export const rawListingSchema = z.object({
  source: z.string().min(1),
  externalId: z.string().min(1),
  url: z.string().url(),
  addressRaw: z.string().min(1),
  priceEur: z.number().int().positive().nullable(),
  surfaceM2: z.number().int().positive().nullable().optional(),
  bedrooms: z.number().int().nonnegative().nullable().optional(),
  propertyType: z.enum(PROPERTY_TYPES).optional(),
  furnished: z.enum(FURNISHED_VALUES).optional(),
  agency: z.string().nullable().optional(),
  imageUrl: z.string().url().nullable().optional(),
  city: z.string().nullable().optional(),
});

export type RawListing = z.infer<typeof rawListingSchema>;

/** A normalized listing, ready for insertion (id/firstSeenAt assigned by the DB). */
export interface Listing {
  source: string;
  externalId: string;
  url: string;
  addressRaw: string;
  street: string | null;
  houseNo: string | null;
  postcode: string | null;
  city: string | null;
  priceEur: number | null;
  surfaceM2: number | null;
  bedrooms: number | null;
  propertyType: PropertyType;
  furnished: Furnished;
  agency: string | null;
  imageUrl: string | null;
  dedupeKey: string;
}

/** Common scraper interface (PLAN.md §3). */
export interface SourceAdapter {
  name: string;
  /** Poll interval in seconds; scheduler applies ±20% jitter. */
  intervalSec: number;
  /** Page 1 only, pre-filtered to Delft, sorted newest-first. */
  fetchLatest(): Promise<RawListing[]>;
}
