CREATE TABLE `optimizer_jobs` (
	`id` text PRIMARY KEY NOT NULL,
	`event_id` integer NOT NULL,
	`status` text DEFAULT 'queued' NOT NULL,
	`snapshot` text NOT NULL,
	`warning` text DEFAULT '' NOT NULL,
	`error` text DEFAULT '' NOT NULL,
	`created_at` text NOT NULL,
	`finished_at` text
);
--> statement-breakpoint
CREATE UNIQUE INDEX `idx_optimizer_jobs_active` ON `optimizer_jobs` (`event_id`) WHERE "optimizer_jobs"."status" IN ('queued','running');