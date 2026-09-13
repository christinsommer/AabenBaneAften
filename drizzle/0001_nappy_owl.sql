CREATE TABLE `substitutions` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`match_id` integer NOT NULL,
	`outgoing_player_id` integer NOT NULL,
	`replacement_player_id` integer,
	`status` text DEFAULT 'searching' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`updated_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_substitutions_match_outgoing` ON `substitutions` (`match_id`,`outgoing_player_id`);--> statement-breakpoint
CREATE INDEX `idx_substitutions_event_status` ON `substitutions` (`event_id`,`status`);