import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text, unique, uniqueIndex } from 'drizzle-orm/sqlite-core';
import type { Furnished, PropertyType } from '../core/types.js';

// Data model from PLAN.md §2.

export const listings = sqliteTable(
  'listings',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    source: text('source').notNull(), // 'pararius' | 'huurwoningen' | ...
    externalId: text('external_id').notNull(), // source-specific id or URL slug
    url: text('url').notNull(),
    addressRaw: text('address_raw').notNull(),
    street: text('street'),
    houseNo: text('house_no'),
    postcode: text('postcode'),
    city: text('city'),
    priceEur: integer('price_eur'), // monthly, excl/incl unknown -> store as shown
    surfaceM2: integer('surface_m2'),
    bedrooms: integer('bedrooms'),
    propertyType: text('property_type').notNull().default('unknown').$type<PropertyType>(),
    furnished: text('furnished').notNull().default('unknown').$type<Furnished>(),
    agency: text('agency'),
    imageUrl: text('image_url'),
    firstSeenAt: integer('first_seen_at', { mode: 'timestamp' })
      .notNull()
      .default(sql`(unixepoch())`),
    dedupeKey: text('dedupe_key').notNull(), // normalized street+houseno+price bucket
  },
  (t) => [unique('listings_source_external_id').on(t.source, t.externalId), index('listings_dedupe_key_idx').on(t.dedupeKey)],
);

export const profiles = sqliteTable(
  'profiles',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    name: text('name').notNull(), // e.g. "Anna & Tom"
    emails: text('emails', { mode: 'json' }).notNull().$type<string[]>(), // couple = 2 recipients
    // Dashboard login (optional): profiles without a username get alerts but
    // cannot log in. NULL usernames don't collide in the unique index.
    username: text('username'),
    passwordHash: text('password_hash'), // scrypt:<salt>:<hash>, see api/auth.ts
    minPrice: integer('min_price'),
    maxPrice: integer('max_price'),
    minBedrooms: integer('min_bedrooms'),
    minSurfaceM2: integer('min_surface_m2'),
    propertyTypes: text('property_types', { mode: 'json' }).notNull().$type<string[]>(), // ["apartment","studio","room"]
    // 4-digit postcode districts, e.g. ["2611","2612"]; empty = whole city.
    postcodes: text('postcodes', { mode: 'json' }).notNull().$type<string[]>().default(sql`'[]'`),
    furnishedPref: text('furnished_pref').notNull().default('any'), // 'any' | 'furnished' | 'unfurnished'
    letterTemplate: text('letter_template').notNull(), // with {placeholders}
    letterVars: text('letter_vars', { mode: 'json' }).notNull().$type<Record<string, string>>(),
    active: integer('active', { mode: 'boolean' }).notNull().default(true),
  },
  (t) => [uniqueIndex('profiles_username_idx').on(t.username)],
);

/** Dashboard login sessions; profile_id NULL means an admin session. */
export const sessions = sqliteTable('sessions', {
  token: text('token').primaryKey(),
  profileId: integer('profile_id').references(() => profiles.id),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
});

export const matches = sqliteTable(
  'matches',
  {
    id: integer('id').primaryKey({ autoIncrement: true }),
    listingId: integer('listing_id')
      .notNull()
      .references(() => listings.id),
    profileId: integer('profile_id')
      .notNull()
      .references(() => profiles.id),
    emailedAt: integer('emailed_at', { mode: 'timestamp' }),
    status: text('status').notNull().default('new'), // 'new' | 'responded' | 'viewing' | 'rejected' | 'won'
  },
  (t) => [unique('matches_listing_profile').on(t.listingId, t.profileId)],
);

export const scrapeRuns = sqliteTable('scrape_runs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  source: text('source').notNull(),
  startedAt: integer('started_at', { mode: 'timestamp' })
    .notNull()
    .default(sql`(unixepoch())`),
  ok: integer('ok', { mode: 'boolean' }).notNull(),
  listingsFound: integer('listings_found').notNull().default(0),
  newListings: integer('new_listings').notNull().default(0),
  error: text('error'),
});
