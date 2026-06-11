CREATE TABLE `nk_abrechnung_leases` (
	`id` text PRIMARY KEY NOT NULL,
	`abrechnung_id` text NOT NULL,
	`lease_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`months_active` integer NOT NULL,
	`kosten_anteil_cents` integer NOT NULL,
	`vorauszahlungen_cents` integer NOT NULL,
	`saldo_cents` integer NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`abrechnung_id`) REFERENCES `nk_abrechnungen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nk_abrechnung_positionen` (
	`id` text PRIMARY KEY NOT NULL,
	`abrechnung_id` text NOT NULL,
	`lease_abrechnung_id` text NOT NULL,
	`category` text NOT NULL,
	`total_costs_cents` integer NOT NULL,
	`distribution_key` text NOT NULL,
	`basis_label` text,
	`share_cents` integer NOT NULL,
	`manual_override` integer DEFAULT false NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`abrechnung_id`) REFERENCES `nk_abrechnungen`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`lease_abrechnung_id`) REFERENCES `nk_abrechnung_leases`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `nk_abrechnungen` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`year` integer NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
