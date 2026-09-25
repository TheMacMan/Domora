ALTER TABLE `leases` ADD `service_charges_type` text DEFAULT 'prepayment' NOT NULL;
--> statement-breakpoint
ALTER TABLE `nk_abrechnung_leases` ADD `is_flat_rate` integer DEFAULT false NOT NULL;
