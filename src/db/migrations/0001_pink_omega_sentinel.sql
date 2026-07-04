CREATE TABLE `sessions` (
	`token` text PRIMARY KEY NOT NULL,
	`profile_id` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`expires_at` integer NOT NULL,
	FOREIGN KEY (`profile_id`) REFERENCES `profiles`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
ALTER TABLE `profiles` ADD `username` text;--> statement-breakpoint
ALTER TABLE `profiles` ADD `password_hash` text;--> statement-breakpoint
CREATE UNIQUE INDEX `profiles_username_idx` ON `profiles` (`username`);