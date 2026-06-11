CREATE TABLE `vpi_entries` (
	`id` text PRIMARY KEY NOT NULL,
	`year_month` text NOT NULL,
	`value` real NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vpi_entries_year_month_unique` ON `vpi_entries` (`year_month`);