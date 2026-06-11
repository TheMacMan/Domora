PRAGMA foreign_keys=OFF;--> statement-breakpoint
CREATE TABLE `__new_loans` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`description` text NOT NULL,
	`loan_type` text DEFAULT 'annuity' NOT NULL,
	`initial_amount_cents` integer,
	`balance_cents` integer NOT NULL,
	`balance_date` text NOT NULL,
	`interest_rate_bps` integer NOT NULL,
	`monthly_payment_cents` integer NOT NULL,
	`start_date` text,
	`interest_fixed_until` text,
	`replaced_by_loan_id` text,
	`bs_total_sum_cents` integer,
	`bs_savings_balance_cents` integer,
	`bs_savings_date` text,
	`bs_monthly_savings_cents` integer,
	`bs_savings_interest_bps` integer,
	`bs_min_savings_permille` integer,
	`bs_target_rating_number` real,
	`bs_current_rating_number` real,
	`bs_rating_date` text,
	`bs_loan_interest_bps` integer,
	`bs_loan_monthly_payment_cents` integer,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
INSERT INTO `__new_loans`("id", "property_id", "description", "initial_amount_cents", "balance_cents", "balance_date", "interest_rate_bps", "monthly_payment_cents", "start_date", "interest_fixed_until", "notes", "created_at", "updated_at", "deleted_at") SELECT "id", "property_id", "description", "initial_amount_cents", "balance_cents", "balance_date", "interest_rate_bps", "monthly_payment_cents", "start_date", "interest_fixed_until", "notes", "created_at", "updated_at", "deleted_at" FROM `loans`;--> statement-breakpoint
DROP TABLE `loans`;--> statement-breakpoint
ALTER TABLE `__new_loans` RENAME TO `loans`;--> statement-breakpoint
PRAGMA foreign_keys=ON;
