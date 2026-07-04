import type { SourceAdapter } from '../core/types.js';

/**
 * Kamernet — Delft rooms/studios/apartments. Listing index is public; details
 * partly paywalled: alert with whatever the card shows + link (PLAN.md §3).
 * TODO(phase 2 per PLAN.md §8): implement fetch + parse.
 */
export const kamernet: SourceAdapter = {
  name: 'kamernet',
  intervalSec: 180,
  async fetchLatest() {
    throw new Error('kamernet adapter not implemented yet');
  },
};
