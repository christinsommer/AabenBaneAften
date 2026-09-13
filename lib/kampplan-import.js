import * as XLSX from "xlsx";

const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];
const time = value => /^(?:[01]?\d|2[0-3])[:.][0-5]\d$/.test(value);

// Also protects the view against older imports containing headings and notes.
export function normalizeKampplanRows(rows) {
  if (!Array.isArray(rows)) return [];
  const matches = [];
  for (const source of rows) {
    const row = Object.fromEntries(keys.map(key => [key, String(source?.[key] ?? '').trim()]));
    const valid = time(row.A) && time(row.B) && /^(?:Bane\s*)?[1-7]$/i.test(row.C)
      && ['D', 'E', 'F', 'G'].every(key => row[key]);
    if (!valid) {
      if (matches.length) break;
      continue;
    }
    matches.push(row);
  }
  return matches;
}

export function parseWorkbookKampplanRows(workbook) {
  const sheetName = workbook?.SheetNames?.find(name => ['kampplan', 'kamp plan'].includes(name.trim().toLowerCase()));
  const sheet = sheetName ? workbook.Sheets[sheetName] : null;
  if (!sheet?.['!ref']) return [];
  const lastRow = XLSX.utils.decode_range(sheet['!ref']).e.r;
  if (lastRow < 4) return [];
  const matrix = XLSX.utils.sheet_to_json(sheet, {
    raw: false, defval: '', blankrows: true, header: 1,
    range: { s: { r: 4, c: 0 }, e: { r: lastRow, c: 6 } },
  });
  const rows = [];
  for (const cells of matrix) {
    if (keys.every((_, index) => !String(cells[index] ?? '').trim())) break;
    rows.push(Object.fromEntries(keys.map((key, index) => [key, cells[index] ?? ''])));
  }
  return normalizeKampplanRows(rows);
}
