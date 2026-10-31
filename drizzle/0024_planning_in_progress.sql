ALTER TABLE `events` ADD `planning_in_progress` integer DEFAULT false NOT NULL;
--> statement-breakpoint
-- A durable job and the member edit lock become visible in the same transaction.
CREATE TRIGGER optimizer_jobs_start_planning
AFTER INSERT ON optimizer_jobs
WHEN NEW.status IN ('queued','running')
BEGIN
  UPDATE events SET planning_in_progress=1 WHERE id=NEW.event_id;
END;
--> statement-breakpoint
-- Preserve the lock for calculations already queued/running at migration time.
UPDATE events SET planning_in_progress=1
WHERE EXISTS (SELECT 1 FROM optimizer_jobs WHERE event_id=events.id AND status IN ('queued','running'));
