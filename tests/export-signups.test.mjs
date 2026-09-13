import assert from 'node:assert/strict';
import test from 'node:test';

import { buildSignupExportRows } from '../lib/export-signups.ts';

test('buildSignupExportRows emits member and slots in the expected order', () => {
  const rows = buildSignupExportRows([
    {
      memberNo: '42',
      firstName: 'Anna',
      lastName: 'Andersen',
      gender: 'K',
      christinRanking: 5,
      availability: ['18:00', '18:30', '19:30'],
      requestedHours: 2,
    },
    {
      memberNo: '10',
      firstName: 'Bjørn',
      lastName: 'Bakke',
      gender: 'M',
      christinRanking: 3,
      availability: ['19:00'],
      requestedHours: 1,
    },
  ]);

  assert.deepEqual(rows[0], [
    'Medlemsnr.',
    'Fornavn Efternavn',
    'Medlems-køn',
    'CR',
    'nHours',
    'nPossible',
    'slot_1',
    'slot_2',
    'slot_3',
    'slot_4',
    'slot_5',
    'szPossible',
  ]);

  assert.deepEqual(rows[1], [
    '42',
    'Anna Andersen',
    'K',
    '5',
    '2',
    '3',
    '18:00',
    '18:30',
    '19:30',
    '',
    '',
    '18:00;18:30;19:30',
  ]);

  assert.deepEqual(rows[2], [
    '10',
    'Bjørn Bakke',
    'M',
    '3',
    '1',
    '1',
    '19:00',
    '',
    '',
    '',
    '',
    '19:00',
  ]);
});
