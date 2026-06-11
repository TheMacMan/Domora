CREATE TABLE `rent_adjustments` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`effective_date` text NOT NULL,
	`rent_cents` integer NOT NULL,
	`service_charges_cents` integer,
	`reason` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE no action
);
