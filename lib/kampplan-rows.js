const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const time = value => /^(?:[01]?\d|2[0-3])[:.][0-5]\d$/.test(value);

// Also protects the view against older imports containing headings and notes.
export function normalizeKampplanRows(rows) {
  if (!Array.isArray(rows)) return [];
  const matches = [];
  for (const source of rows) {
    const row = Object.fromEntries(keys.map(key => [key, String(source?.[key] ?? '').trim()]));
    const valid = time(row.A) && time(row.B) && /^(?:Bane\s*)?[1-7]$/i.test(row.C)
      && (['D', 'E', 'F', 'G'].every(key => row[key]) || (['D', 'E'].filter(key => row[key]).length === 1 && ['F', 'G'].filter(key => row[key]).length === 1));
    if (!valid) {
      if (matches.length) break;
      continue;
    }
    matches.push(row);
  }
  return matches;
}

