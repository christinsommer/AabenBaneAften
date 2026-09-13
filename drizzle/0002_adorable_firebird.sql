ALTER TABLE players ADD COLUMN first_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE players ADD COLUMN last_name text NOT NULL DEFAULT '';
--> statement-breakpoint
ALTER TABLE players ADD COLUMN christin_ranking integer CONSTRAINT players_cr_range CHECK (christin_ranking IS NULL OR (typeof(christin_ranking) = 'integer' AND christin_ranking BETWEEN 1 AND 9));
--> statement-breakpoint
UPDATE players SET first_name = CASE WHEN instr(trim(name), ' ') > 0 THEN substr(trim(name), 1, instr(trim(name), ' ') - 1) ELSE trim(name) END,
  last_name = CASE WHEN instr(trim(name), ' ') > 0 THEN trim(substr(trim(name), instr(trim(name), ' ') + 1)) ELSE '' END;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN registration_override text NOT NULL DEFAULT 'auto' CONSTRAINT events_registration_override CHECK (registration_override IN ('auto', 'open', 'closed'));
--> statement-breakpoint
ALTER TABLE events ADD COLUMN is_test integer NOT NULL DEFAULT 0;
--> statement-breakpoint
ALTER TABLE events ADD COLUMN test_active integer NOT NULL DEFAULT 0;
--> statement-breakpoint
UPDATE events SET is_test = 1, test_active = 1, registration_override = 'open' WHERE date = '2026-09-11';
