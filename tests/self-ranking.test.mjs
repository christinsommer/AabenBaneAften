import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { normalizeSelfLevel, SELF_LEVELS } from '../lib/ranking.ts';
import { profileValues } from '../lib/profile.ts';

const examples = [
  ...SELF_LEVELS.map(level => [level, level]),
  [' a ', 'A'], ['A+', 'A'], ['A-', 'AB'], ['B+', 'AB'], ['B-', 'BC'], ['C+', 'BC'], ['C-', 'C'],
  [' a / b ', 'AB'], ['b/c', 'BC'], ['A−', 'AB'], ['b–', 'BC'], ['\t b+\n', 'AB'],
  ['begynder', 'Begynder'], ['', 'Begynder'], ['ukendt', 'Begynder'], ['rutineret A spiller', 'Begynder'], ['toString', 'Begynder'],
];

test('legacy rankings use explicit aliases and unknown values become Begynder', () => {
  for (const [old, expected] of examples) assert.equal(normalizeSelfLevel(old), expected, old);
  assert.equal(normalizeSelfLevel(null), 'Begynder');
});

test('profile writes accept only the six dropdown values', () => {
  const profile = { firstName: 'Test', lastName: 'Member', memberNo: '1', email: 'test@example.com', gender: 'K' };
  for (const level of SELF_LEVELS) assert.equal(profileValues({ ...profile, level }).selfLevel, level);
  for (const level of ['B+', 'B-', 'begynder', 'ukendt', '', null]) assert.throws(() => profileValues({ ...profile, level }), /Vælg egen ranking/);
});

test('migration converts existing members without changing other columns or history and is repeatable', () => {
  const db = new Database(':memory:');
  try {
    for (const file of readdirSync('drizzle').filter(file => file.endsWith('.sql') && file < '0007').sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    const insert = db.prepare('INSERT INTO players (member_no,name,email,gender,self_level,pin_hash,christin_ranking,admin_level) VALUES (?,?,?,?,?,?,?,?)');
    examples.forEach(([level], index) => insert.run(String(index), `Member ${index}`, 'test@example.com', 'K', level, 'unchanged-hash', 5, 'B'));
    const original = db.prepare('SELECT * FROM players ORDER BY id').all();
    const eventId = db.prepare('SELECT id FROM events LIMIT 1').get().id;
    db.prepare('INSERT INTO signups(event_id,player_id,availability) VALUES(?,?,?)').run(eventId, original[0].id, '["18:00"]');
    const signups = db.prepare('SELECT * FROM signups').all();
    const sql = readFileSync('drizzle/0007_self_ranking_options.sql', 'utf8');
    db.exec(sql);
    const expected = original.map((row, index) => ({ ...row, self_level: examples[index][1] }));
    assert.deepEqual(db.prepare('SELECT * FROM players ORDER BY id').all(), expected);
    assert.deepEqual(db.prepare('SELECT * FROM signups').all(), signups);
    db.exec(sql);
    assert.deepEqual(db.prepare('SELECT * FROM players ORDER BY id').all(), expected);
  } finally { db.close(); }
});
