CREATE TABLE `events` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`date` text NOT NULL,
	`registration_opens_at` text NOT NULL,
	`registration_closes_at` text NOT NULL,
	`status` text DEFAULT 'draft' NOT NULL,
	`published_at` text,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_events_date` ON `events` (`date`);--> statement-breakpoint
CREATE TABLE `feedback` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`match_id` integer NOT NULL,
	`author_player_id` integer NOT NULL,
	`balance` text NOT NULL,
	`subject_player_id` integer,
	`direction` text,
	`comment` text DEFAULT '' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_feedback_match_author` ON `feedback` (`match_id`,`author_player_id`);--> statement-breakpoint
CREATE TABLE `match_requests` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`creator_player_id` integer NOT NULL,
	`invited_member_nos` text NOT NULL,
	`accepted_player_ids` text NOT NULL,
	`status` text DEFAULT 'pending' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL,
	`completed_at` text
);
--> statement-breakpoint
CREATE INDEX `idx_match_requests_event_status` ON `match_requests` (`event_id`,`status`);--> statement-breakpoint
CREATE TABLE `matches` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`court` integer NOT NULL,
	`start_time` text NOT NULL,
	`player_ids` text NOT NULL,
	`locked` integer DEFAULT false NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_matches_event_time` ON `matches` (`event_id`,`start_time`,`court`);--> statement-breakpoint
CREATE TABLE `players` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`member_no` text NOT NULL,
	`name` text NOT NULL,
	`email` text DEFAULT '' NOT NULL,
	`phone` text DEFAULT '' NOT NULL,
	`gender` text NOT NULL,
	`self_level` text NOT NULL,
	`admin_level` text,
	`role` text DEFAULT 'player' NOT NULL,
	`pin_hash` text NOT NULL,
	`suspended_event_id` integer,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_players_member_no` ON `players` (`member_no`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`token_hash` text PRIMARY KEY NOT NULL,
	`player_id` integer NOT NULL,
	`expires_at` text NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_sessions_player_id` ON `sessions` (`player_id`);--> statement-breakpoint
CREATE TABLE `signups` (
	`id` integer PRIMARY KEY AUTOINCREMENT NOT NULL,
	`event_id` integer NOT NULL,
	`player_id` integer NOT NULL,
	`availability` text NOT NULL,
	`requested_hours` integer DEFAULT 1 NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text DEFAULT CURRENT_TIMESTAMP NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_signups_event_player` ON `signups` (`event_id`,`player_id`);--> statement-breakpoint
CREATE INDEX `idx_signups_event_status` ON `signups` (`event_id`,`status`);