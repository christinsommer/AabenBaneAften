import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {kampplanWorkbook} from '../lib/kampplan-export.js';
import {parseWorkbookKampplanRows} from '../lib/kampplan-import.js';

test('export survives an Excel write/read and the existing import without changing teams or times', () => {
  const rows = [
    {A:'18:30', B:'19:30', C:'5', D:'Anne Æ', E:'Bo Ø', F:'Clara Å', G:'Dan'},
    {A:'21:00', B:'22:00', C:'1', D:'Anne Æ', E:'', F:'Clara Å', G:''},
  ];
  const workbook = kampplanWorkbook(rows, '2026-09-18');
  const restored = XLSX.read(XLSX.write(workbook, {type:'buffer', bookType:'xlsx'}));
  assert.deepEqual(restored.SheetNames, ['KampPlan']);
  assert.equal(restored.Sheets.KampPlan.A4.v, 'Start');
  assert.equal(restored.Sheets.KampPlan.J4.v, 'Niveauforskel');
  assert.equal(restored.Sheets.KampPlan.A5.t, 'n');
  assert.deepEqual(parseWorkbookKampplanRows(restored), rows);
});

test('an empty export is rejected', () => {
  assert.throws(() => kampplanWorkbook([], '2026-09-18'), /ingen kampplan/);
});
