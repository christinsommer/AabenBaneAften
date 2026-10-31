import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {readFileSync,readdirSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {migrationStatements} from '../scripts/migration-statements.mjs';

test('planning migration preserves existing data, locks pending jobs and rolls back the lock with job creation',()=>{
 const db=new Database(':memory:');
 try {
  const files=readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort(),manifest=JSON.parse(readFileSync('drizzle/checksums.json','utf8'));
  for(const file of files){
   const source=readFileSync(`drizzle/${file}`,'utf8');
   assert.equal(createHash('sha256').update(source.replaceAll('\r\n','\n')).digest('hex'),manifest[file],file);
   if(file<'0024_planning_in_progress.sql')for(const sql of migrationStatements(source))db.exec(sql);
  }
  for(const id of [100,101])db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at) VALUES(?,?,'2030-06-10','2030-06-11')").run(id,`2030-06-${id-88}`);
  db.prepare("INSERT INTO optimizer_jobs(id,event_id,status,snapshot,created_at) VALUES('old',100,'queued','{}','2030-06-11')").run();
  const before=db.prepare('SELECT * FROM events WHERE id>=100 ORDER BY id').all();
  for(const sql of migrationStatements(readFileSync('drizzle/0024_planning_in_progress.sql','utf8')))db.exec(sql);
  const after=db.prepare('SELECT * FROM events WHERE id>=100 ORDER BY id').all();
  assert.deepEqual(after.map(({planning_in_progress,...row})=>row),before);
  assert.deepEqual(after.map(row=>row.planning_in_progress),[1,0]);
  db.exec('BEGIN');db.prepare("INSERT INTO optimizer_jobs(id,event_id,status,snapshot,created_at) VALUES('new',101,'queued','{}','2030-06-11')").run();
  assert.equal(db.prepare('SELECT planning_in_progress AS flag FROM events WHERE id=101').get().flag,1);
  db.exec('ROLLBACK');assert.equal(db.prepare('SELECT planning_in_progress AS flag FROM events WHERE id=101').get().flag,0);
  db.prepare("UPDATE optimizer_jobs SET status='failed' WHERE id='old'").run();
  assert.equal(db.prepare('SELECT planning_in_progress AS flag FROM events WHERE id=100').get().flag,1);
 } finally {db.close();}
});
