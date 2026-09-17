ALTER TABLE `players` ADD `cr_reviewed_at` text;
--> statement-breakpoint
UPDATE `players` SET `cr_reviewed_at` = CURRENT_TIMESTAMP;
