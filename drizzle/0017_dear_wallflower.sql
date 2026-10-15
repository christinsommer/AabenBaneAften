CREATE TABLE `auth_rate_limits` (
	`key` text PRIMARY KEY NOT NULL,
	`attempts` integer NOT NULL,
	`expires_at` integer NOT NULL,
	`blocked_until` integer NOT NULL
);
--> statement-breakpoint
CREATE INDEX `idx_auth_rate_limits_expires` ON `auth_rate_limits` (`expires_at`);