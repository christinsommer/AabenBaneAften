const minutes = (value: unknown) => {
  const match = String(value ?? '').trim().match(/^(\d{1,2})[:.](\d{2})$/);
  return match ? Number(match[1]) * 60 + Number(match[2]) : NaN;
};

export function unusedImportedCourts(rows: Record<string, unknown>[], times: string[]) {
  if (!rows.length) return [];
  const matches = rows.map(row => ({
    court: Number(String(row.C ?? '').replace(/^Bane\s*/i, '').trim()),
    start: minutes(row.A), end: minutes(row.B),
  }));
  return times.map(time => {
    const start = minutes(time);
    return { time, courts: (time.endsWith(':30') ? [5,6,7] : [1,2,3,4]).filter(court =>
      !matches.some(match => match.court === court && match.start < start + 60 && match.end > start)) };
  }).filter(slot => slot.courts.length > 0);
}
