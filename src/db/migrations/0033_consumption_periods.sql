CREATE TABLE IF NOT EXISTS `consumption_periods` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`medium` text NOT NULL,
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`quantity` real NOT NULL,
	`cost_cents` integer,
	`advance_cents` integer,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `consumption_periods_property_idx` ON `consumption_periods` (`property_id`, `medium`);
