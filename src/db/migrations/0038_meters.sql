CREATE TABLE `meters` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL REFERENCES `properties`(`id`),
	`name` text NOT NULL,
	`meter_number` text,
	`kind` text DEFAULT 'meter' NOT NULL,
	`purpose` text NOT NULL,
	`host_unit_id` text NOT NULL REFERENCES `units`(`id`),
	`unit_id` text REFERENCES `units`(`id`),
	`estimate_kwh_per_year` real,
	`estimate_note` text,
	`calibration_until` text,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `meter_readings` (
	`id` text PRIMARY KEY NOT NULL,
	`meter_id` text NOT NULL REFERENCES `meters`(`id`),
	`date` text NOT NULL,
	`value` real NOT NULL,
	`reason` text DEFAULT 'interim' NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE INDEX `meter_readings_meter_date_idx` ON `meter_readings` (`meter_id`,`date`);
--> statement-breakpoint
CREATE TABLE `supply_prices` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL REFERENCES `leases`(`id`),
	`valid_from` text NOT NULL,
	`ct_per_kwh` real NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
CREATE TABLE `electricity_settlements` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL REFERENCES `properties`(`id`),
	`direction` text NOT NULL,
	`lease_id` text NOT NULL REFERENCES `leases`(`id`),
	`period_start` text NOT NULL,
	`period_end` text NOT NULL,
	`kwh` real NOT NULL,
	`amount_cents` integer NOT NULL,
	`lines_json` text NOT NULL,
	`number` text NOT NULL,
	`document_id` text,
	`status` text DEFAULT 'open' NOT NULL,
	`paid_at` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer
);
--> statement-breakpoint
ALTER TABLE `expenses` ADD `electricity_settlement_id` text;
--> statement-breakpoint
ALTER TABLE `expenses` ADD `nk_exclude` integer DEFAULT 0 NOT NULL;
