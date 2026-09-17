import assert from 'node:assert/strict';
import test from 'node:test';
import * as XLSX from 'xlsx';
import {unfulfilledWishes} from '../lib/unfulfilled-wishes.ts';
import {kampplanWorkbook} from '../lib/kampplan-export.js';
import {parseWorkbookKampplanRows} from '../lib/kampplan-import.js';

const rows = [{A:'20:00', B:'21:00', C:'1', D:'Kora Canger', E:'Bo', F:'Anne', G:'Dan'}];
const registration = (id, name, requestedHours, status='active') => ({player:{id,name},
  signup:{status,requestedHours,availability:JSON.stringify(['20:00','21:00'])}});

test('unfulfilled wishes use the displayed plan, include missing first hours and exclude cancellations', () => {
  const wishes = unfulfilledWishes(rows, [registration(1,'Kora Canger',2),registration(2,'Anil',1),
    registration(3,'Anne',1),registration(4,'Cancelled',2,'cancelled'),registration(5,'Waiting',2,'waitlist')]);
  assert.equal(wishes.length,3);
  assert.deepEqual(wishes.find(w=>w.name==='Kora Canger'),{id:1,name:'Kora Canger',requested:2,assigned:1,missing:1,
    availability:['20:00','21:00'],assignedTimes:['20:00'],status:'Tilmeldt',note:''});
  assert.equal(wishes.find(w=>w.name==='Anil').assigned,0);
  assert.equal(wishes.find(w=>w.name==='Waiting').status,'Venteliste');
  assert.equal(unfulfilledWishes([...rows,{A:'21:00',B:'22:00',C:'1',D:'Kora Canger',E:'',F:'Anil',G:''}],
    [registration(1,'Kora Canger',2),registration(2,'Anil',1)]).length,0);
});

test('duplicate names are flagged for manual review instead of inventing an allocation', () => {
  const wishes=unfulfilledWishes(rows,[registration(1,'Kora Canger',1),registration(2,' Kora  Canger ',1)]);
  assert.equal(wishes.length,2);
  assert.ok(wishes.every(w=>w.assigned===null && w.missing===null && w.note.includes('samme navn')));
});

test('export appends a separated wishes report and remains reimportable', () => {
  const wishes=unfulfilledWishes(rows,[registration(1,'Kora Canger',2),registration(2,'Anil',1)]);
  const wb=kampplanWorkbook(rows,'2026-09-18',wishes);
  const restored=XLSX.read(XLSX.write(wb,{type:'buffer',bookType:'xlsx'}));
  assert.deepEqual(parseWorkbookKampplanRows(restored),rows);
  const matrix=XLSX.utils.sheet_to_json(restored.Sheets.KampPlan,{header:1,blankrows:true,defval:''});
  assert.ok(matrix[5].every(cell=>cell===''));
  assert.equal(matrix[6][0],'Ikke opfyldte ønsker');
  assert.equal(matrix[7][0],'Navn');
  const kora=matrix.find(row=>row[0]==='Kora Canger');
  assert.deepEqual(kora.slice(0,7),['Kora Canger',2,1,1,'20:00, 21:00','20:00','Tilmeldt']);
});
