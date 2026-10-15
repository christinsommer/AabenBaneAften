import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {verifyExport,compareExports,verifyLiveExport} from '../scripts/privacy-backup-lib.mjs';
import {migrationStatements} from '../scripts/migration-statements.mjs';

test('live verification tolerates sessions and member edits, but rejects schema, migration and reference errors',()=>{
 const dir=mkdtempSync(join(tmpdir(),'release-live-'));
 const before=join(dir,'before.sql'),after=join(dir,'after.sql');
 try{
  let sql='PRAGMA foreign_keys=OFF; CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT);\n';
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
   sql+=migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).join(';\n')+';\n';
   sql+=`INSERT INTO d1_migrations(name) VALUES('${file}');\n`;
  }
  sql+="INSERT INTO players(id,member_no,name,gender,self_level,pin_hash) VALUES(999,'synthetic','Synthetic','K','B','hash');";
  writeFileSync(before,sql);
  const activity="INSERT INTO sessions(token_hash,player_id,expires_at) VALUES('synthetic',999,'2099-01-01'); UPDATE players SET name='Edited' WHERE id=999;";
  writeFileSync(after,sql+activity);
  const report=verifyLiveExport(before,after);
  assert.ok(report.differences.some(row=>row.table==='sessions'));
  assert.ok(report.differences.some(row=>row.table==='players'));
  assert.equal(report.liveDataEqualityChecked,false);
  for(const [mutation,error] of [
   ['ALTER TABLE players ADD COLUMN unexpected TEXT;',/schema differs/],
   ["DELETE FROM d1_migrations WHERE name=(SELECT max(name) FROM d1_migrations);",/migration history differs/],
   // sessions.player_id has no SQL foreign key. Exercise an actual declared
   // reference so PRAGMA foreign_key_check can detect the broken relationship.
   ["INSERT INTO privacy_acknowledgements(player_id,document_type,version,acknowledged_at,source) VALUES(123456,'privacy','v1','2026-10-14','test');",/integrity check failed/],
  ]){
   writeFileSync(after,sql+activity+mutation);
   assert.throws(()=>verifyLiveExport(before,after),error);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('live comparison accepts privacy visits but still rejects lost consent, closure changes and backwards activity',()=>{
 const dir=mkdtempSync(join(tmpdir(),'release-activity-'));
 const before=join(dir,'before.sql'),after=join(dir,'after.sql');
 const base=`CREATE TABLE privacy_acknowledgements(player_id INTEGER,document_type TEXT,version TEXT,PRIMARY KEY(player_id,document_type));
 INSERT INTO privacy_acknowledgements VALUES(1,'privacy','v1');
 CREATE TABLE profile_privacy(player_id INTEGER PRIMARY KEY,last_active_at TEXT,activity_known INTEGER,activity_type TEXT,closed_at TEXT);
 INSERT INTO profile_privacy VALUES(1,'2026-01-01T00:00:00Z',0,'baseline',NULL);`;
 const activity=`INSERT INTO privacy_acknowledgements VALUES(1,'cookies','v1');
 UPDATE profile_privacy SET last_active_at='2026-10-14T00:00:00Z',activity_known=1,activity_type='visit';`;
 const options={allowConcurrentPrivacyActivity:true};
 try{
  writeFileSync(before,base);writeFileSync(after,base+activity);
  assert.throws(()=>compareExports(before,after),/differs from backup/);
  assert.equal(compareExports(before,after,options).privacy_acknowledgements,1);
  for(const mutation of [
   "DELETE FROM privacy_acknowledgements WHERE document_type='privacy';",
   "UPDATE privacy_acknowledgements SET version='v2' WHERE document_type='privacy';",
   "UPDATE profile_privacy SET closed_at='2026-10-14';",
   'DELETE FROM profile_privacy;',
   "UPDATE profile_privacy SET last_active_at='2025-01-01T00:00:00Z';",
   'UPDATE profile_privacy SET activity_known=0;',
  ]){
   writeFileSync(after,base+activity+mutation);
   assert.throws(()=>compareExports(before,after,options),/differs from backup/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test('release accepts additive columns but rejects changes, deletions and missing original columns',()=>{
 const dir=mkdtempSync(join(tmpdir(),'release-additive-'));
 try{
  let sql='CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT);\n';
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&f<'0015').sort()){
   sql+=migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).join(';\n')+';\n';
   sql+=`INSERT INTO d1_migrations(name) VALUES('${file}');\n`;
  }
  sql+="INSERT INTO players(member_no,name,gender,self_level,pin_hash) VALUES('synthetic','Synthetic','K','B','hash');\n";
  sql+="INSERT INTO events(date,registration_opens_at,registration_closes_at) VALUES('2030-01-04','2030-01-02','2030-01-03');\n";
  const before=join(dir,'before.sql'),after=join(dir,'after.sql');
  writeFileSync(before,sql);
  assert.equal(verifyExport(before,join(dir,'rehearsal.sqlite')).migrationPreservedExistingData,true);
  const additive=sql+'ALTER TABLE events ADD registration_schedule_custom INTEGER NOT NULL DEFAULT 0;\n';
  writeFileSync(after,additive);
  assert.equal(compareExports(before,after).events,35);
  for(const mutation of ["UPDATE events SET date='2030-01-11' WHERE date='2030-01-04';","DELETE FROM events WHERE date='2030-01-04';",'ALTER TABLE events DROP COLUMN published_at;']){
   writeFileSync(after,additive+mutation);
   assert.throws(()=>compareExports(before,after),/changed existing data|removed existing schema/);
  }
 }finally{rmSync(dir,{recursive:true,force:true});}
});
