CREATE TABLE forbidden_pairs (
  member_a TEXT NOT NULL,
  member_b TEXT NOT NULL,
  PRIMARY KEY (member_a, member_b),
  CHECK (member_a < member_b)
);
--> statement-breakpoint
-- One-time transfer of existing HIK constraints. Empty club databases start empty.
INSERT INTO forbidden_pairs(member_a,member_b)
SELECT a,b FROM (
  SELECT '13993' AS a, '17108' AS b
  UNION ALL SELECT '16212','17108'
  UNION ALL SELECT '11822','15722'
)
WHERE EXISTS (SELECT 1 FROM players WHERE member_no IN ('17108','13993','16212','11822','15722'));
