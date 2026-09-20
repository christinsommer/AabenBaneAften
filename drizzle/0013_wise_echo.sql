CREATE TABLE `registration_defaults` (
	`id` integer PRIMARY KEY NOT NULL,
	`open_days` integer DEFAULT 2 NOT NULL,
	`open_time` text DEFAULT '06:00' NOT NULL,
	`close_days` integer DEFAULT 1 NOT NULL,
	`close_time` text DEFAULT '12:00' NOT NULL
);
