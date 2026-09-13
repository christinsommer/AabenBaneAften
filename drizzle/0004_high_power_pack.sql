CREATE TABLE `pin_reset_tokens` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`player_id` integer NOT NULL,
	`token_hash` text NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_pin_reset_tokens_player` ON `pin_reset_tokens` (`player_id`);--> statement-breakpoint
CREATE INDEX `idx_pin_reset_tokens_expires` ON `pin_reset_tokens` (`expires_at`);--> statement-breakpoint
ALTER TABLE `events` ADD `imported_kampplan` text DEFAULT '' NOT NULL;