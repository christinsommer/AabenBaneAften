import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {fingerprintLocalD1} from '../scripts/local-d1-fingerprint.mjs';

test('local migration fingerprints accept added columns but detect changed or removed data',async()=>{
  const sqlite=new Database(':memory:');
  const db={prepare:sql=>({all:async()=>({results:sqlite.prepare(sql).all()})})};
  try {
    sqlite.exec("CREATE TABLE sessions(token TEXT, expires_at TEXT); INSERT INTO sessions VALUES('synthetic','2099-01-01')");
    const before=await fingerprintLocalD1(db);
    sqlite.exec('ALTER TABLE sessions ADD last_seen_at TEXT');
    assert.deepEqual(await fingerprintLocalD1(db,before),before);
    sqlite.exec("UPDATE sessions SET expires_at='2000-01-01'");
    assert.notDeepEqual(await fingerprintLocalD1(db,before),before);
    sqlite.exec('DELETE FROM sessions');
    assert.notDeepEqual(await fingerprintLocalD1(db,before),before);
    sqlite.exec('ALTER TABLE sessions DROP COLUMN expires_at');
    await assert.rejects(fingerprintLocalD1(db,before),/removed existing columns/);
  } finally {sqlite.close();}
});
