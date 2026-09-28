CREATE TABLE `vehicles` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`plate` text,
	`fuel_type` text DEFAULT 'combustion' NOT NULL,
	`ownership` text DEFAULT 'purchase' NOT NULL,
	`in_use_from` text NOT NULL,
	`in_use_to` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `vehicle_odometer` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`),
	`date` text NOT NULL,
	`km` integer NOT NULL,
	`kind` text DEFAULT 'other' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `vehicle_costs` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`),
	`date` text NOT NULL,
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text,
	`service_period_start` text,
	`service_period_end` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `vehicle_years` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`),
	`year` integer NOT NULL,
	`method` text DEFAULT 'actual' NOT NULL,
	`estimated_km` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `vehicle_years_vehicle_year_idx` ON `vehicle_years` (`vehicle_id`,`year`);
--> statement-breakpoint
CREATE TABLE `trip_routes` (
	`id` text PRIMARY KEY NOT NULL,
	`name` text NOT NULL,
	`route` text NOT NULL,
	`km` real NOT NULL,
	`property_id` text REFERENCES `properties`(`id`),
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `trips` (
	`id` text PRIMARY KEY NOT NULL,
	`vehicle_id` text NOT NULL REFERENCES `vehicles`(`id`),
	`property_id` text NOT NULL REFERENCES `properties`(`id`),
	`date` text NOT NULL,
	`route` text NOT NULL,
	`km` real NOT NULL,
	`purpose` text NOT NULL,
	`expense_id` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `trips_vehicle_date_idx` ON `trips` (`vehicle_id`,`date`);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `trip_id` text;
