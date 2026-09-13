import test from 'node:test';
import assert from 'node:assert/strict';
import { isPlayersImportedMatch } from '../lib/kampplan-filter.ts';

test('own-match filter matches whole player names in either team without changing data', () => {
  const row = { A:'18:30', B:'19:30', C:'Bane 1', D:'Christin  Hytoft Sommer', E:'Søren Schødt', F:'Maiken Pelby', G:'Glen Hytoft Sommer' };
  const before = structuredClone(row);
  assert.equal(isPlayersImportedMatch(row, ' christin hytoft sommer '), true);
  assert.equal(isPlayersImportedMatch(row, 'GLEN HYTOFT SOMMER'), true);
  assert.equal(isPlayersImportedMatch(row, 'Sommer'), false);
  assert.equal(isPlayersImportedMatch(row, 'Bane 1'), false);
  assert.equal(isPlayersImportedMatch(row, ''), false);
  assert.deepEqual(row, before);
});
