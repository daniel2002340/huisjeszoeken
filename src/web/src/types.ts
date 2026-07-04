// Shapes returned by the API (see src/api/routes.ts).

export interface Profile {
  id: number;
  name: string;
  emails: string[];
  username: string | null;
  minPrice: number | null;
  maxPrice: number | null;
  minBedrooms: number | null;
  minSurfaceM2: number | null;
  propertyTypes: string[];
  furnishedPref: string;
  letterTemplate: string;
  letterVars: Record<string, string>;
  active: boolean;
}

/** Password is write-only: empty/omitted on update keeps the current one. */
export type ProfileInput = Omit<Profile, 'id'> & { password?: string };

/** Who is logged in; profileId null = admin. */
export interface Me {
  profileId: number | null;
  name: string;
  admin: boolean;
}

export const MATCH_STATUSES = ['new', 'responded', 'viewing', 'rejected', 'won'] as const;
export type MatchStatus = (typeof MATCH_STATUSES)[number];

export interface MatchFeedItem {
  id: number;
  status: MatchStatus;
  emailedAt: string | null;
  profileId: number;
  profileName: string;
  listing: {
    url: string;
    addressRaw: string;
    city: string | null;
    priceEur: number | null;
    surfaceM2: number | null;
    bedrooms: number | null;
    propertyType: string;
    furnished: string;
    agency: string | null;
    imageUrl: string | null;
    source: string;
    firstSeenAt: string;
  };
}

export interface SourceStatus {
  source: string;
  healthy: boolean;
  lastSuccessAt: string | null;
  lastRunAt: string | null;
  lastListingsFound: number | null;
  newPerDay: Array<{ day: string; count: number }>;
  recentErrors: Array<{ at: string; error: string | null }>;
}

export interface StatusResponse {
  sources: SourceStatus[];
}

export interface LetterPreviewResponse {
  letter: string;
  sample: { addressRaw: string; priceEur: number | null; agency: string | null };
}
