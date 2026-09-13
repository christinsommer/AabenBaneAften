import test from 'node:test';
import assert from 'node:assert/strict';
import { unusedImportedCourts } from '../lib/unused-courts.ts';

test('imported court 1 matches occupy only their actual intervals', () => {
  const result = unusedImportedCourts([
    {A:'18:00',B:'19:00',C:'1'}, {A:'19.00',B:'20.00',C:'Bane 1'},
  ], ['18:00','18:30','19:00','20:00']);
  assert.deepEqual(result, [
    {time:'18:00',courts:[2,3,4]}, {time:'18:30',courts:[5,6,7]},
    {time:'19:00',courts:[2,3,4]}, {time:'20:00',courts:[1,2,3,4]},
  ]);
});
test('no import produces no free-court list; overlapping matches block a slot', () => {
  assert.deepEqual(unusedImportedCourts([], ['18:00']), []);
  assert.deepEqual(unusedImportedCourts([{A:'18:30',B:'20:00',C:'1'}], ['18:00','19:00']), [
    {time:'18:00',courts:[2,3,4]}, {time:'19:00',courts:[2,3,4]},
  ]);
});
