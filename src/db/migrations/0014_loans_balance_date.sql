-- start_date → balance_date (loans hat noch keine Produktivdaten)
PRAGMA foreign_keys=OFF;

CREATE TABLE `loans_new` (
  `id` text PRIMARY KEY NOT NULL,
  `property_id` text NOT NULL REFERENCES `properties`(`id`),
  `description` text NOT NULL,
  `initial_amount_cents` integer NOT NULL,
  `balance_cents` integer NOT NULL,
  `balance_date` text NOT NULL,
  `interest_rate_bps` integer NOT NULL,
  `monthly_payment_cents` integer NOT NULL,
  `notes` text,
  `created_at` integer NOT NULL DEFAULT (unixepoch()),
  `updated_at` integer NOT NULL DEFAULT (unixepoch()),
  `deleted_at` integer
);

INSERT INTO `loans_new` SELECT
  `id`, `property_id`, `description`, `initial_amount_cents`,
  `balance_cents`, `start_date`, `interest_rate_bps`,
  `monthly_payment_cents`, `notes`, `created_at`, `updated_at`, `deleted_at`
FROM `loans`;

DROP TABLE `loans`;
ALTER TABLE `loans_new` RENAME TO `loans`;

PRAGMA foreign_keys=ON;