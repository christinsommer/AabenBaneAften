import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,writeFileSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {applyPending,fingerprint,verifyExport} from '../scripts/privacy-backup-lib.mjs';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {spawnSync} from 'node:child_process';
test('privacy: consistent backup, isolated restore, additive migration and repetition preserve existing rows',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-privacy-'));const source=new Database(join(dir,'source.sqlite'));
 try{
  source.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT)');
  for(const f of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0016')).sort()){
   for(const s of migrationStatements(readFileSync(`drizzle/${f}`,'utf8')))source.exec(s);
   source.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(f);
  }
  source.exec("INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES('test','Synthetic Test','synthetic@example.test','K','B','synthetic-hash')");
  const before=fingerprint(source);await source.backup(join(dir,'backup.sqlite'));const restored=new Database(join(dir,'backup.sqlite'));
  try{assert.deepEqual(fingerprint(restored),before);applyPending(restored);for(const [table,value]of Object.entries(before))assert.deepEqual(fingerprint(restored)[table],value);const first=fingerprint(restored);applyPending(restored);assert.deepEqual(fingerprint(restored),first);assert.equal(restored.pragma('integrity_check',{simple:true}),'ok');}finally{restored.close();}
  const tables=source.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  let dump='PRAGMA foreign_keys=OFF;\n';
  for(const t of tables){dump+=t.sql+';\n';for(const row of source.prepare(`SELECT * FROM "${t.name}"`).all())dump+=`INSERT INTO "${t.name}" VALUES(${Object.values(row).map(v=>v===null?'NULL':typeof v==='number'?v:"'"+String(v).replaceAll("'","''")+"'").join(',')});\n`;}
  for(const {sql} of source.prepare("SELECT sql FROM sqlite_master WHERE type IN ('trigger','index') AND sql IS NOT NULL").all())dump+=sql+';\n';
  writeFileSync(join(dir,'export.sql'),dump);assert.equal(verifyExport(join(dir,'export.sql'),join(dir,'rehearsal.sqlite')).migrationPreservedExistingData,true);
 }finally{source.close();rmSync(dir,{recursive:true,force:true});}
});
test('offline recovery replays later closure and pause, revokes sessions and does not resend',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-restore-')),latestPath=join(dir,'latest.sqlite'),backupPath=join(dir,'old.sqlite'),outputPath=join(dir,'output.sqlite');
 const db=new Database(latestPath);
 try{
  applyPending(db);
  db.exec("INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES('one','Synthetic One','one@example.test','K','B','hash'),('two','Synthetic Two','two@example.test','K','B','hash')");
  db.exec("INSERT INTO newsletter_events VALUES('consent-one',1,'one@example.test','subscribe','2026-10-01','profile','v1','Checkbox','Help'),('consent-two',2,'two@example.test','subscribe','2026-10-01','profile','v1','Checkbox','Help'); INSERT INTO newsletter_preferences VALUES(1,'subscribed',NULL,'rev1','consent-one','2026-10-01'),(2,'subscribed',NULL,'rev2','consent-two','2026-10-01'); INSERT INTO sessions(token_hash,player_id,expires_at) VALUES('old-session',1,'2099-01-01')");
  await db.backup(backupPath);
  db.exec("UPDATE players SET member_no='closed-one',name='Lukket profil',email='',pin_hash='' WHERE id=1; UPDATE profile_privacy SET closed_at='2026-10-10' WHERE player_id=1; UPDATE newsletter_preferences SET status='paused',paused_until='2026-11-10',changed_at='2026-10-11' WHERE player_id=2; DELETE FROM sessions");
  const result=spawnSync(process.execPath,['scripts/privacy-restore.mjs',backupPath,latestPath,outputPath],{encoding:'utf8',windowsHide:true});assert.equal(result.status,0,result.stderr);
  const restored=new Database(outputPath,{readonly:true});try{
   assert.equal(restored.prepare('SELECT email FROM players WHERE id=1').get().email,'');assert.ok(restored.prepare('SELECT closed_at FROM profile_privacy WHERE player_id=1').get().closed_at);
   assert.equal(restored.prepare('SELECT status FROM newsletter_preferences WHERE player_id=2').get().status,'paused');assert.equal(restored.prepare('SELECT count(*) n FROM sessions').get().n,0);assert.equal(restored.prepare('SELECT email FROM newsletter_events WHERE id=?').get('consent-one').email,null);
  }finally{restored.close();}
 }finally{db.close();rmSync(dir,{recursive:true,force:true});}
});
