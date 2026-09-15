ALTER TABLE `players` ADD `birth_year` integer;
--> statement-breakpoint
-- Only synthetic sandbox profiles have known age-at-creation semantics.
-- Preserve real members' legacy age without inventing a birth year.
UPDATE players SET birth_year = CAST(substr(created_at, 1, 4) AS INTEGER) - age
WHERE member_no LIKE 'SB50-%' AND age IS NOT NULL
  AND CAST(substr(created_at, 1, 4) AS INTEGER) - age BETWEEN 1940 AND CAST(strftime('%Y', 'now') AS INTEGER) - 16;
