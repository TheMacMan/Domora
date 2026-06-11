CREATE TABLE `loan_payments` (
	`id` text PRIMARY KEY NOT NULL,
	`loan_id` text NOT NULL,
	`due_date` text NOT NULL,
	`total_cents` integer NOT NULL,
	`interest_cents` integer NOT NULL,
	`principal_cents` integer NOT NULL,
	`balance_after_cents` integer NOT NULL,
	`paid_at` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`loan_id`) REFERENCES `loans`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE TABLE `loans` (
	`id` text PRIMARY KEY NOT NULL,
	`property_id` text NOT NULL,
	`description` text NOT NULL,
	`initial_amount_cents` integer NOT NULL,
	`balance_cents` integer NOT NULL,
	`interest_rate_bps` integer NOT NULL,
	`monthly_payment_cents` integer NOT NULL,
	`start_date` text NOT NULL,
	`notes` text,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`updated_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`property_id`) REFERENCES `properties`(`id`) ON UPDATE no action ON DELETE no action
);
