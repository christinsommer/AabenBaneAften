import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync, readdirSync} from 'node:fs';
import Database from 'better-sqlite3';

test('migration marks existing members reviewed and leaves future members pending without changing CR', () => {
  const db = new Database(':memory:');
  try {
    for (const file of readdirSync('drizzle').filter(name=>name.endsWith('.sql') && name < '0010').sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    const insert = db.prepare("INSERT INTO players(member_no,name,gender,self_level,pin_hash,christin_ranking) VALUES(?,?,'K','B','hash',5)");
    insert.run('old','Existing Member');
    const before = db.prepare("SELECT * FROM players WHERE member_no='old'").get();
    db.exec(readFileSync('drizzle/0010_cr_review.sql', 'utf8'));
    const {cr_reviewed_at, ...after} = db.prepare("SELECT * FROM players WHERE member_no='old'").get();
    assert.ok(cr_reviewed_at);
    assert.deepEqual(after, before);
    insert.run('new','New Member');
    const member = db.prepare("SELECT * FROM players WHERE member_no='new'").get();
    assert.equal(member.cr_reviewed_at, null);
    assert.equal(member.christin_ranking, 5);
  } finally { db.close(); }
});
