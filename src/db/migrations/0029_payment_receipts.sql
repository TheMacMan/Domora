CREATE TABLE IF NOT EXISTS `payment_receipts` (
	`id` text PRIMARY KEY NOT NULL,
	`lease_id` text NOT NULL,
	`kind` text NOT NULL,
	`payment_id` text,
	`settlement_year` integer,
	`received_at` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`lease_id`) REFERENCES `leases`(`id`) ON UPDATE no action ON DELETE no action,
	FOREIGN KEY (`payment_id`) REFERENCES `payments`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_receipts_payment_idx` ON `payment_receipts` (`payment_id`);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS `payment_receipts_lease_idx` ON `payment_receipts` (`lease_id`);
--> statement-breakpoint
-- Bestehende Zahlungen übernehmen: je bezahltem Monat ein Eingang (Summe + letztes Datum).
INSERT INTO `payment_receipts` (`id`, `lease_id`, `kind`, `payment_id`, `received_at`, `amount_cents`, `note`)
SELECT lower(hex(randomblob(12))), p.`lease_id`, 'rent', p.`id`, COALESCE(p.`paid_at`, p.`due_date`), p.`paid_cents`, 'übernommen'
FROM `payments` p
WHERE p.`deleted_at` IS NULL AND p.`paid_cents` IS NOT NULL AND p.`paid_cents` <> 0
  AND NOT EXISTS (SELECT 1 FROM `payment_receipts` r WHERE r.`payment_id` = p.`id` AND r.`deleted_at` IS NULL);
