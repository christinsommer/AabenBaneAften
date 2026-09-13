import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import Database from 'better-sqlite3';

test('profile migration preserves identities and history and constrains CR and overrides',()=>{
  const db=new Database(':memory:');
  try {
    for(const name of ['0000_previous_slyde.sql','0001_nappy_owl.sql']) db.exec(readFileSync('drizzle/'+name,'utf8'));
    db.prepare('INSERT INTO players (id,member_no,name,email,gender,self_level,role,pin_hash) VALUES (?,?,?,?,?,?,?,?)').run(42,'13993','Christin Test Sommer','member@example.com','K','AB','admin','original-pin-hash');
    db.exec("INSERT INTO events (id,date,registration_opens_at,registration_closes_at) VALUES (7,'2026-09-11','2026-09-09','2026-09-10')");
    db.exec("INSERT INTO signups (event_id,player_id,availability) VALUES (7,42,'[\"18:00\"]')");
    const original=db.prepare('SELECT * FROM players').get();
    db.exec(readFileSync('drizzle/0002_adorable_firebird.sql','utf8'));
    const after=db.prepare('SELECT * FROM players').get();
    for(const key of Object.keys(original))assert.equal(after[key],original[key]);
    assert.equal(after.first_name,'Christin');assert.equal(after.last_name,'Test Sommer');assert.equal(after.christin_ranking,null);
    assert.deepEqual(db.prepare('SELECT player_id,event_id FROM signups').get(),{player_id:42,event_id:7});
    const event=db.prepare('SELECT * FROM events').get();
    assert.equal(event.test_active,1);assert.equal(event.is_test,1);assert.equal(event.registration_override,'open');
    for(const invalid of [0,10,1.5,'bad'])assert.throws(()=>db.prepare('UPDATE players SET christin_ranking=?').run(invalid),/CHECK/);
    for(const valid of [1,9,null])db.prepare('UPDATE players SET christin_ranking=?').run(valid);
    assert.throws(()=>db.exec("UPDATE events SET registration_override='invalid'"),/CHECK/);
  }finally{db.close();}
});
