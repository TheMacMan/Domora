CREATE TABLE `lease_tenants` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`tenant_id` text NOT NULL,
	`sort_order` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`tenant_id`) REFERENCES `tenants`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `lease_tenants` (`id`, `lease_id`, `tenant_id`, `sort_order`)
SELECT lower(hex(randomblob(10))), `id`, `tenant_id`, 0 FROM `leases` WHERE `tenant_id` IS NOT NULL;--> statement-breakpoint
PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`unit_id` text NOT NULL,
	`start_date` text NOT NULL,
	`end_date` text,
	`rent_cents` integer NOT NULL,
	`service_charges_cents` integer,
	`deposit_cents` integer,
	`rent_type` text DEFAULT 'fixed' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_leases`("id", "unit_id", "start_date", "end_date", "rent_cents", "service_charges_cents", "deposit_cents", "rent_type", "notes", "created_at", "updated_at", "deleted_at") SELECT "id", "unit_id", "start_date", "end_date", "rent_cents", "service_charges_cents", "deposit_cents", "rent_type", "notes", "created_at", "updated_at", "deleted_at" FROM `leases`;--> statement-breakpoint
DROP TABLE `leases`;--> statement-breakpoint
ALTER TABLE `__new_leases` RENAME TO `leases`;--> statement-breakpoint
PRAGMA foreign_keys=ON;