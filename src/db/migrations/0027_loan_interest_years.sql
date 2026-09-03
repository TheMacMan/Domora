CREATE TABLE IF NOT EXISTS `loan_interest_years` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`year` integer NOT NULL,
	`interest_cents` integer NOT NULL,
	`note` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS `loan_interest_years_loan_year_uq` ON `loan_interest_years` (`loan_id`,`year`);
