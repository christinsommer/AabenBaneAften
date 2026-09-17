import * as XLSX from 'xlsx';
import { normalizeKampplanRows } from './kampplan-rows.js';

export function kampplanWorkbook(rows, date, wishes = []) {
  const matches = normalizeKampplanRows(rows);
  if (!matches.length) throw new Error('Der er ingen kampplan at eksportere.');
  const sheet = XLSX.utils.aoa_to_sheet([
    ['KampPlan – Åben bane'],
    [`Kampplan for ${date}. Holdenes spillere er angivet i samme rækkefølge som i appen.`],
    [],
    ['Start', 'Slut', 'Bane', 'Hold 1 – kvinde', 'Hold 1 – mand', 'Hold 2 – kvinde', 'Hold 2 – mand', 'Niveau hold 1', 'Niveau hold 2', 'Niveauforskel'],
    ...matches.map(row => ['A', 'B', 'C', 'D', 'E', 'F', 'G'].map(key => row[key])),
    [],
    ['Ikke opfyldte ønsker'],
    ['Navn', 'Ønskede timer', 'Tildelte timer', 'Manglende timer', 'Mulige starttider', 'Tildelte starttider', 'Status', 'Bemærkning'],
    ...(wishes.length ? wishes.map(wish => [wish.name, wish.requested, wish.assigned ?? 'Ukendt', wish.missing ?? 'Ukendt',
      wish.availability.join(', '), wish.assignedTimes.join(', '), wish.status, wish.note]) : [['Alle timeønsker er opfyldt.']]),
  ]);
  // Match the template's row positions and use real Excel times.
  for (let index = 0; index < matches.length; index++) {
    for (const column of ['A', 'B']) {
      const [hour, minute] = matches[index][column].replace('.', ':').split(':').map(Number);
      sheet[`${column}${index + 5}`] = {t: 'n', v: (hour * 60 + minute) / 1440, z: 'hh:mm'};
    }
  }
  sheet['!cols'] = [10, 10, 8, 28, 28, 28, 28, 14, 14, 14].map(wch => ({wch}));
  sheet['!merges'] = [0, 1].map(r => ({s: {r, c: 0}, e: {r, c: 9}}));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, 'KampPlan');
  return workbook;
}

export function downloadKampplan(rows, date, wishes = []) {
  XLSX.writeFile(kampplanWorkbook(rows, date, wishes), 'Kampplan.xlsx');
}
