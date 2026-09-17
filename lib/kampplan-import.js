import * as XLSX from 'xlsx';
import { normalizeKampplanRows } from './kampplan-rows.js';
export { normalizeKampplanRows } from './kampplan-rows.js';
const keys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

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
