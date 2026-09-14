-- Convert only self ranking; preserve administrator ratings and member history.
UPDATE players
SET self_level = CASE upper(replace(replace(replace(replace(replace(replace(replace(trim(self_level), ' ', ''), char(9), ''), char(10), ''), char(13), ''), char(160), ''), '−', '-'), '–', '-'))
  WHEN 'A' THEN 'A'
  WHEN 'A+' THEN 'A'
  WHEN 'AB' THEN 'AB'
  WHEN 'A/B' THEN 'AB'
  WHEN 'A-' THEN 'AB'
  WHEN 'B+' THEN 'AB'
  WHEN 'B' THEN 'B'
  WHEN 'BC' THEN 'BC'
  WHEN 'B/C' THEN 'BC'
  WHEN 'B-' THEN 'BC'
  WHEN 'C+' THEN 'BC'
  WHEN 'C' THEN 'C'
  WHEN 'C-' THEN 'C'
  ELSE 'Begynder'
END
WHERE self_level NOT IN ('A', 'AB', 'B', 'BC', 'C', 'Begynder');
