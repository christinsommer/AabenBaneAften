import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { normalizeKampplanRows, parseWorkbookKampplanRows } from "../lib/kampplan-import.js";

test("selects the KampPlan sheet and reads the matching data rows", () => {
  const workbook = XLSX.utils.book_new();

  const tilmeldingerSheet = XLSX.utils.aoa_to_sheet([
    ["Medlemsnummer", "Navn"],
    ["1", "Mads"],
  ]);
  XLSX.utils.book_append_sheet(workbook, tilmeldingerSheet, "Tilmeldinger");

  const kampPlanSheet = XLSX.utils.aoa_to_sheet([
    ["Forslaget prioriterer gyldige kampe", "Bane"],
    ["", "", "", "", "", "", ""],
    ["", "", "", "", "", "", ""],
    ["Start", "Slut", "Bane", "Hold 1 - kvinde", "Hold 1 - mand", "Hold 2 - kvinde", "Hold 2 - mand"],
    ["18:30", "19:30", "1", "Christin Hytoft Sommer", "Søren Schødt", "Michala Bjerggaard", "Maiken Pelby"],
    ["19:30", "20:30", "1", "Christin Hytoft Sommer", "Søren Schødt", "Maiken Pelby", "Glenn Hytoft Sommer"],
    [],
    ["Ikke sat i kamp", "Spiller", "Begrundelse"],
    ["20:30", "21:30", "2", "Not", "Part", "Of", "Plan"],
  ]);
  XLSX.utils.book_append_sheet(workbook, kampPlanSheet, "KampPlan");

  const rows = parseWorkbookKampplanRows(workbook);

  assert.equal(rows.length, 2);
  assert.deepEqual(rows[0], {
    A: "18:30",
    B: "19:30",
    C: "1",
    D: "Christin Hytoft Sommer",
    E: "Søren Schødt",
    F: "Michala Bjerggaard",
    G: "Maiken Pelby",
  });
  assert.equal(rows[1].G, "Glenn Hytoft Sommer");
});

test('an empty fifth row means no matches, even if later rows contain matches', () => {
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([
    ['Title'], [], [], ['Start','Slut','Bane'], [],
    ['18:30','19:30','1','A','B','C','D'],
  ]), 'Kampplan');
  assert.deepEqual(parseWorkbookKampplanRows(workbook), []);
});

test('legacy imports show only the contiguous match block, never headings or later sections', () => {
  const match = { A:'18:30', B:'19:30', C:'1', D:'A', E:'B', F:'C', G:'D' };
  assert.deepEqual(normalizeKampplanRows([
    {A:'Title',C:'Bane'}, {A:'Start',B:'Slut',C:'Bane'}, match,
    {A:'Ikke sat i kamp',C:'Begrundelse'}, {...match,C:'2'},
  ]), [match]);
});
