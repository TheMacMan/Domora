CREATE TABLE IF NOT EXISTS `property_depreciation_items` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`method` text DEFAULT 'linear' NOT NULL,
	`rate_bps` integer,
	`basis_mode` text DEFAULT 'prior_year' NOT NULL,
	`explanation` text,
	`annual_cents` integer NOT NULL,
	`from_year` integer,
	`to_year` integer,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `property_depreciation_items_property_idx` ON `property_depreciation_items` (`property_id`);
