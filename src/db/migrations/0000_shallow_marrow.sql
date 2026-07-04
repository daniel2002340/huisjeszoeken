CREATE TABLE `listings` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`external_id` text NOT NULL,
	`url` text NOT NULL,
	`address_raw` text NOT NULL,
	`street` text,
	`house_no` text,
	`postcode` text,
	`city` text,
	`price_eur` integer,
	`surface_m2` integer,
	`bedrooms` integer,
	`property_type` text DEFAULT 'unknown' NOT NULL,
	`furnished` text DEFAULT 'unknown' NOT NULL,
	`agency` text,
	`image_url` text,
	`first_seen_at` integer DEFAULT (unixepoch()) NOT NULL,
	`dedupe_key` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `listings_dedupe_key_idx` ON `listings` (`dedupe_key`);--> statement-breakpoint
CREATE UNIQUE INDEX `listings_source_external_id` ON `listings` (`source`,`external_id`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`listing_id` integer NOT NULL,
	`profile_id` integer NOT NULL,
	`emailed_at` integer,
	`status` text DEFAULT 'new' NOT NULL,
	FOREIGN KEY (`listing_id`) REFERENCES `listings`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `matches_listing_profile` ON `matches` (`listing_id`,`profile_id`);--> statement-breakpoint
CREATE TABLE `profiles` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`name` text NOT NULL,
	`emails` text NOT NULL,
	`min_price` integer,
	`max_price` integer,
	`min_bedrooms` integer,
	`min_surface_m2` integer,
	`property_types` text NOT NULL,
	`furnished_pref` text DEFAULT 'any' NOT NULL,
	`letter_template` text NOT NULL,
	`letter_vars` text NOT NULL,
	`active` integer DEFAULT true NOT NULL
);
--> statement-breakpoint
CREATE TABLE `scrape_runs` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`source` text NOT NULL,
	`started_at` integer DEFAULT (unixepoch()) NOT NULL,
	`ok` integer NOT NULL,
	`listings_found` integer DEFAULT 0 NOT NULL,
	`new_listings` integer DEFAULT 0 NOT NULL,
	`error` text
);
