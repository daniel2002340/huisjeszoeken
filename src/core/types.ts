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
  /** Explicit postcode when the source provides one the address line lacks;
   * a bare 4-digit district ("2624") is allowed and matchable. */
  postcode: z
    .string()
    .regex(/^\d{4}(\s?[A-Za-z]{2})?$/)
    .nullable()
    .optional(),
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
  /**
   * Optional detail-page fetch, called by the scheduler ONLY for listings
   * that passed dedupe (i.e. once per listing, ever) to fill in what the
   * card lacks — typically the full address for postcode matching and
   * cross-source dedupe. Returns fields to merge into the raw listing, or
   * null when the detail page had nothing better. Errors are logged and the
   * card-level data is used as-is (over-send, never drop).
   */
  enrich?(raw: RawListing): Promise<Partial<RawListing> | null>;
}
