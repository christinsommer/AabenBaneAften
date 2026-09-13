SELECT e.date AS dato, p.member_no AS medlemsnr, p.name AS navn,
       CASE WHEN s.status IS NULL OR s.status = 'cancelled' THEN 0 ELSE s.requested_hours END AS nHours,
       CASE WHEN s.status IS NULL OR s.status = 'cancelled' THEN 0 ELSE json_array_length(s.availability) END AS nPossible,
       CASE WHEN s.status IS NULL OR s.status = 'cancelled' THEN '[]' ELSE s.availability END AS szPossible,
       COALESCE(s.status, 'not_registered') AS status
FROM players p
CROSS JOIN events e
LEFT JOIN signups s ON s.player_id = p.id AND s.event_id = e.id
WHERE e.date = '2026-09-11'
ORDER BY p.name;
