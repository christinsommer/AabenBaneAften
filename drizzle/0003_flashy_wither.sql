ALTER TABLE `events` ADD `archived` integer DEFAULT false NOT NULL;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-09-11','2026-09-09T10:00:00.000Z','2026-09-10T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-09-18','2026-09-16T10:00:00.000Z','2026-09-17T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-09-25','2026-09-23T10:00:00.000Z','2026-09-24T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-10-02','2026-09-30T10:00:00.000Z','2026-10-01T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-10-09','2026-10-07T10:00:00.000Z','2026-10-08T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-10-16','2026-10-14T10:00:00.000Z','2026-10-15T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-10-23','2026-10-21T10:00:00.000Z','2026-10-22T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-10-30','2026-10-28T11:00:00.000Z','2026-10-29T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-11-06','2026-11-04T11:00:00.000Z','2026-11-05T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-11-13','2026-11-11T11:00:00.000Z','2026-11-12T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-11-20','2026-11-18T11:00:00.000Z','2026-11-19T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-11-27','2026-11-25T11:00:00.000Z','2026-11-26T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-12-04','2026-12-02T11:00:00.000Z','2026-12-03T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-12-11','2026-12-09T11:00:00.000Z','2026-12-10T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-12-18','2026-12-16T11:00:00.000Z','2026-12-17T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2026-12-25','2026-12-23T11:00:00.000Z','2026-12-24T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-01-01','2026-12-30T11:00:00.000Z','2026-12-31T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-01-08','2027-01-06T11:00:00.000Z','2027-01-07T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-01-15','2027-01-13T11:00:00.000Z','2027-01-14T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-01-22','2027-01-20T11:00:00.000Z','2027-01-21T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-01-29','2027-01-27T11:00:00.000Z','2027-01-28T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-02-05','2027-02-03T11:00:00.000Z','2027-02-04T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-02-12','2027-02-10T11:00:00.000Z','2027-02-11T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-02-19','2027-02-17T11:00:00.000Z','2027-02-18T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-02-26','2027-02-24T11:00:00.000Z','2027-02-25T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-03-05','2027-03-03T11:00:00.000Z','2027-03-04T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-03-12','2027-03-10T11:00:00.000Z','2027-03-11T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-03-19','2027-03-17T11:00:00.000Z','2027-03-18T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-03-26','2027-03-24T11:00:00.000Z','2027-03-25T11:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-04-02','2027-03-31T10:00:00.000Z','2027-04-01T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-04-09','2027-04-07T10:00:00.000Z','2027-04-08T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-04-16','2027-04-14T10:00:00.000Z','2027-04-15T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-04-23','2027-04-21T10:00:00.000Z','2027-04-22T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
--> statement-breakpoint
INSERT INTO events (date,registration_opens_at,registration_closes_at) VALUES ('2027-04-30','2027-04-28T10:00:00.000Z','2027-04-29T10:00:00.000Z') ON CONFLICT(date) DO NOTHING;
