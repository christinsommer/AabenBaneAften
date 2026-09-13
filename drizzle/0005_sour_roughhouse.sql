ALTER TABLE `signups` ADD `signup_order` integer;--> statement-breakpoint
CREATE UNIQUE INDEX `idx_signups_event_order` ON `signups` (`event_id`,`signup_order`);
--> statement-breakpoint
WITH ranked AS (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY event_id ORDER BY created_at, id) AS position
  FROM signups
)
UPDATE signups SET signup_order = (SELECT position FROM ranked WHERE ranked.id = signups.id);
--> statement-breakpoint
CREATE TRIGGER signups_assign_order
AFTER INSERT ON signups
WHEN NEW.signup_order IS NULL AND NEW.requested_hours > 0 AND NEW.status <> 'cancelled'
BEGIN
  UPDATE signups
  SET signup_order = (SELECT COALESCE(MAX(signup_order), 0) + 1 FROM signups WHERE event_id = NEW.event_id)
  WHERE id = NEW.id;
END;
--> statement-breakpoint
CREATE TRIGGER signups_rejoin_order
AFTER UPDATE OF requested_hours, status ON signups
WHEN NEW.requested_hours > 0 AND NEW.status <> 'cancelled'
  AND (OLD.requested_hours = 0 OR OLD.status = 'cancelled' OR OLD.signup_order IS NULL)
BEGIN
  UPDATE signups
  SET signup_order = (SELECT COALESCE(MAX(signup_order), 0) + 1 FROM signups WHERE event_id = NEW.event_id)
  WHERE id = NEW.id;
END;
