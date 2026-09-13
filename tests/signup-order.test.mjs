import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import Database from 'better-sqlite3';
import { migrationStatements } from '../scripts/migration-statements.mjs';

test('signup order backfills timestamp/id order and survives edits; rejoining goes to the back', () => {
  const db = new Database(':memory:');
  try {
    for (const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql') && f < '0005').sort()) db.exec(readFileSync(`drizzle/${file}`, 'utf8'));
    db.exec(`INSERT INTO signups(id,event_id,player_id,availability,created_at) VALUES
      (1,1,1,'[]','2026-09-10 12:00:01'),
      (2,1,2,'[]','2026-09-10 12:00:00'),
      (3,1,3,'[]','2026-09-10 12:00:00'),
      (4,2,1,'[]','2026-09-10 12:00:00');`);
    for (const statement of migrationStatements(readFileSync('drizzle/0005_sour_roughhouse.sql','utf8'))) db.exec(statement);
    const order = id => db.prepare('SELECT signup_order FROM signups WHERE id=?').get(id).signup_order;
    assert.deepEqual([1,2,3,4].map(order),[3,1,2,1]);
    // The production application can omit the new field entirely.
    db.exec("INSERT INTO signups(id,event_id,player_id,availability) VALUES(5,1,5,'[]')");
    assert.equal(order(5),4);
    db.exec("UPDATE signups SET requested_hours=3,availability='[\"18:30\",\"19:30\",\"20:30\"]',status='active' WHERE id=2");
    assert.equal(order(2),1);
    db.exec("UPDATE signups SET status='waitlist' WHERE id=2; UPDATE signups SET status='active' WHERE id=2");
    assert.equal(order(2),1);
    db.exec("UPDATE signups SET status='cancelled' WHERE id=2; UPDATE signups SET status='active' WHERE id=2");
    assert.equal(order(2),5);
    db.exec("UPDATE signups SET requested_hours=0 WHERE id=3; UPDATE signups SET requested_hours=1 WHERE id=3");
    assert.equal(order(3),6);
    db.exec("INSERT INTO signups(id,event_id,player_id,availability,requested_hours) VALUES(6,1,6,'[]',0)");
    assert.equal(order(6),null);
    db.exec("UPDATE signups SET requested_hours=1 WHERE id=6");
    assert.equal(order(6),7);
    assert.throws(()=>db.exec('UPDATE signups SET signup_order=7 WHERE id=5'),/UNIQUE/);
  } finally { db.close(); }
});
