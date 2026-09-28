CREATE TABLE `document_links` (
	`id` text PRIMARY KEY NOT NULL,
	`document_id` text NOT NULL,
	`target_type` text NOT NULL,
	`target_id` text NOT NULL,
	`created_at` integer DEFAULT (unixepoch()) NOT NULL,
	`deleted_at` integer,
	FOREIGN KEY (`document_id`) REFERENCES `documents`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE INDEX `document_links_target_idx` ON `document_links` (`target_type`,`target_id`);
--> statement-breakpoint
CREATE INDEX `document_links_document_idx` ON `document_links` (`document_id`);
--> statement-breakpoint
INSERT INTO `document_links` (`id`, `document_id`, `target_type`, `target_id`, `created_at`)
	SELECT lower(hex(randomblob(12))), `document_id`, 'expense', `expense_id`, `created_at` FROM `expense_documents`;
--> statement-breakpoint
DROP TABLE `expense_documents`;
