PRAGMA foreign_keys=OFF;
CREATE TABLE `loans_new` (
  `id` text PRIMARY KEY NOT NULL,
  `property_id` text NOT NULL,
  `description` text NOT NULL,
  `initial_amount_cents` integer,
  `balance_cents` integer NOT NULL,
  `balance_date` text NOT NULL,
  `interest_rate_bps` integer NOT NULL,
  `monthly_payment_cents` integer NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch()),
  `deleted_at` integer,
  `interest_fixed_until` text,
  `start_date` text,
  FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`)
);
INSERT INTO `loans_new` SELECT * FROM `loans`;
DROP TABLE `loans`;
ALTER TABLE `loans_new` RENAME TO `loans`;
PRAGMA foreign_keys=ON;
