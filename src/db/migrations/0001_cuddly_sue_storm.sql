CREATE TABLE `properties` (
	`id` text PRIMARY KEY NOT NULL,
	`street` text NOT NULL,
	`postal_code` text NOT NULL,
	`city` text NOT NULL,
	`living_area` real NOT NULL,
	`year_built` integer,
	`purchase_date` text,
	`purchase_price_total` integer,
	`purchase_price_land` integer,
	`depreciation_permille` integer DEFAULT 20 NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
