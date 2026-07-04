/**
 * Dedupe policy (PLAN.md §2): exact (source, external_id) first; cross-source via
 * dedupe_key. On a cross-source duplicate the earliest listing is kept and the
 * notification is skipped — i.e. a duplicate is never inserted or emailed.
 */

/** The fields dedupe needs; both core Listings and DB rows satisfy this. */
export interface KnownListing {
  source: string;
  externalId: string;
  dedupeKey: string;
}

export interface ListingLookup {
  findBySourceExternalId(source: string, externalId: string): KnownListing | undefined;
  findByDedupeKey(dedupeKey: string): KnownListing | undefined;
}

export type DedupeVerdict =
  | { isDuplicate: false }
  | { isDuplicate: true; reason: 'same-source' | 'cross-source'; existing: KnownListing };

export function checkDuplicate(candidate: KnownListing, lookup: ListingLookup): DedupeVerdict {
  const exact = lookup.findBySourceExternalId(candidate.source, candidate.externalId);
  if (exact) {
    return { isDuplicate: true, reason: 'same-source', existing: exact };
  }

  const byKey = lookup.findByDedupeKey(candidate.dedupeKey);
  if (byKey) {
    return {
      isDuplicate: true,
      reason: byKey.source === candidate.source ? 'same-source' : 'cross-source',
      existing: byKey,
    };
  }

  return { isDuplicate: false };
}

/** In-memory lookup over already-seen listings (tests, and small batch runs). */
export function createInMemoryLookup(existing: KnownListing[]): ListingLookup {
  return {
    findBySourceExternalId: (source, externalId) =>
      existing.find((l) => l.source === source && l.externalId === externalId),
    findByDedupeKey: (dedupeKey) => existing.find((l) => l.dedupeKey === dedupeKey),
  };
}
