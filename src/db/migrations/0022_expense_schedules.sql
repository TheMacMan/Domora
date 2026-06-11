CREATE TABLE `expense_schedules` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text REFERENCES `properties`(`id`),
	`category` text NOT NULL,
	`amount_cents` integer NOT NULL,
	`description` text,
	`start_month` text NOT NULL,
	`end_month` text,
	`day_of_month` integer NOT NULL DEFAULT 1,
	`notes` text,
	`created_at` integer NOT NULL DEFAULT (unixepoch()),
	`updated_at` integer NOT NULL DEFAULT (unixepoch()),
	`deleted_at` integer
);

ALTER TABLE `expenses` ADD COLUMN `schedule_id` text;

CREATE INDEX `idx_expenses_schedule_id` ON `expenses`(`schedule_id`);
