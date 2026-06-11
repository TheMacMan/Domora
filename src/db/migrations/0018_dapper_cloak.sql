CREATE TABLE `lease_rent_components` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`kind` text NOT NULL,
	`description` text,
	`amount_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE no action
);
