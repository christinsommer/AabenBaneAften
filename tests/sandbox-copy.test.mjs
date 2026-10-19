import test from 'node:test';
import assert from 'node:assert/strict';
import Database from 'better-sqlite3';
import {mkdtempSync,writeFileSync,rmSync,mkdirSync,copyFileSync,readFileSync,readdirSync,existsSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {getPlatformProxy} from 'wrangler';
import {applyPending} from '../scripts/privacy-backup-lib.mjs';
import {prepareSandbox} from '../scripts/sandbox-copy.mjs';

test('sandbox refresh preserves playing data, removes live credentials and contact data, and verifies isolated D1',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-sandbox-test-'));
 const source=new Database(':memory:');let proxy;
 try {
  applyPending(source);
  source.exec('DELETE FROM events');
  source.exec(`INSERT INTO players(id,member_no,name,email,phone,gender,self_level,pin_hash,role) VALUES
   (1,'13993','Private Person','private@example.com','12345678','M','B','production-secret','admin'),
   (2,'321','Other Person','other@example.com','87654321','K','B','other-secret','player');
   UPDATE players SET spouse_no=321,spouse_mode='same_time' WHERE id=1;
   INSERT INTO events(id,date,registration_opens_at,registration_closes_at) VALUES(1,'2026-10-18','2026-10-01','2026-10-17');
   INSERT INTO signups(event_id,player_id,availability,requested_hours) VALUES(1,1,'["18:00","19:00"]',1);
   INSERT INTO matches(id,event_id,court,start_time,player_ids) VALUES(1,1,1,'18:00','[1,2]');
   INSERT INTO sessions(token_hash,player_id,expires_at) VALUES('production-session',1,'2099-01-01');
   INSERT INTO admin_mfa VALUES(1,'production-mfa','version',1,'["production-recovery"]');
   INSERT INTO forbidden_pairs VALUES('13993','321');`);
  source.prepare('UPDATE events SET imported_kampplan=?').run(JSON.stringify([{A:'18:00',B:'19:00',C:1,D:'Private Person',E:'',F:'Other Person',G:'',_secret:'private metadata'}]));
  let dump='PRAGMA foreign_keys=OFF;\n';
  for(const t of source.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all()){
   dump+=t.sql+';\n';
   for(const row of source.prepare(`SELECT * FROM "${t.name}"`).all())dump+=`INSERT INTO "${t.name}" VALUES(${Object.values(row).map(v=>v===null?'NULL':typeof v==='number'?v:"'"+String(v).replaceAll("'","''")+"'").join(',')});\n`;
  }
  for(const {sql} of source.prepare("SELECT sql FROM sqlite_master WHERE type IN ('trigger','index') AND sql IS NOT NULL").all())dump+=sql+';\n';
  const sqlPath=join(dir,'source.sql'),stage=join(dir,'stage');writeFileSync(sqlPath,dump);
  const report=await prepareSandbox({sqlPath,stage,credentials:{adminPin:'1234',playerPin:'5678'}});
  assert.equal(report.counts.players,4);
  proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(stage,'v3')}});
  const db=proxy.env.DB;
  const p=await db.prepare('SELECT * FROM players WHERE id=1').first();
  assert.equal(p.name,'Testspiller 1');assert.equal(p.member_no,'10000001');assert.equal(p.spouse_no,10000002);
  assert.equal(p.email,'player-1@example.invalid');assert.equal(p.phone,'');assert.equal(p.role,'player');assert.notEqual(p.pin_hash,'production-secret');
  for(const t of ['sessions','admin_mfa','optimizer_jobs','newsletter_dispatches'])assert.equal((await db.prepare(`SELECT count(*) n FROM ${t}`).first()).n,0);
  const plan=JSON.parse((await db.prepare('SELECT imported_kampplan FROM events').first()).imported_kampplan);
  assert.equal(plan[0].D,'Testspiller 1');assert.equal(plan[0]._secret,undefined);
  assert.deepEqual((await db.prepare('SELECT member_a,member_b FROM forbidden_pairs').all()).results,[{member_a:'10000001',member_b:'10000002'}]);
  await assert.rejects(prepareSandbox({sqlPath,stage,credentials:{}}),/already exists/);
 } finally {await proxy?.dispose();source.close();rmSync(dir,{recursive:true,force:true});}
});

test('PowerShell refresh parses and WhatIf performs no export or activation',{skip:process.platform!=='win32'},()=>{
 const result=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File','Refresh-Sandbox.ps1','-WhatIf'],{encoding:'utf8',windowsHide:true});
 assert.equal(result.status,0,result.stderr);assert.match(result.stdout,/What if/i);
});

test('PowerShell backs up local state, blocks mail, preserves unrelated settings, and leaves Sandbox intact on preparation failure',{skip:process.platform!=='win32'},()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-refresh-wrapper-'));
 try {
  copyFileSync('Refresh-Sandbox.ps1',join(dir,'Refresh-Sandbox.ps1'));
  for(const p of ['scripts','node_modules/wrangler/bin','.wrangler/local-dev/v3'])mkdirSync(join(dir,p),{recursive:true});
  writeFileSync(join(dir,'.wrangler/local-dev/v3/marker'),'old sandbox');
  writeFileSync(join(dir,'.dev.vars'),'RESEND_API_KEY="test-production-key"\nOTHER_SETTING="preserve"\n');
  writeFileSync(join(dir,'node_modules/wrangler/bin/wrangler.js'),`const fs=require('node:fs'); const a=process.argv.slice(2); if(a.slice(0,4).join(' ')!=='d1 export DB --remote')process.exit(9);fs.writeFileSync(a.find(s=>s.startsWith('--output=')).slice(9),'synthetic export');`);
  const helper=join(dir,'scripts/sandbox-copy.mjs');
  const run=(...args)=>spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',join(dir,'Refresh-Sandbox.ps1'),...args],{encoding:'utf8',windowsHide:true});
  writeFileSync(helper,'process.exit(7)');
  let result=run();assert.notEqual(result.status,0);assert.equal(readFileSync(join(dir,'.wrangler/local-dev/v3/marker'),'utf8'),'old sandbox');assert.match(readFileSync(join(dir,'.dev.vars'),'utf8'),/test-production-key/);
  writeFileSync(helper,`import fs from 'node:fs';import path from 'node:path';const [,stage,report]=process.argv.slice(2);fs.mkdirSync(path.join(stage,'v3'),{recursive:true});fs.writeFileSync(path.join(stage,'v3/marker'),'new sandbox');fs.writeFileSync(report,JSON.stringify({adminId:3,verifiedAt:new Date().toISOString()}));`);
  result=run('-PrepareOnly');assert.equal(result.status,0,result.stderr);assert.equal(readFileSync(join(dir,'.wrangler/local-dev/v3/marker'),'utf8'),'old sandbox');
  result=run();assert.equal(result.status,0,result.stderr);
  assert.equal(readFileSync(join(dir,'.wrangler/local-dev/v3/marker'),'utf8'),'new sandbox');
  const vars=readFileSync(join(dir,'.dev.vars'),'utf8');assert.match(vars,/RESEND_API_KEY=""/);assert.match(vars,/NEWSLETTER_ENABLED="false"/);assert.match(vars,/OTHER_SETTING="preserve"/);assert.match(vars,/SUPERADMIN_PLAYER_ID="3"/);assert.match(vars,/MFA_ENCRYPTION_KEY="[a-f0-9]{64}"/);
  const state=join(dir,'.data/sandbox-refresh');const backup=readdirSync(state).map(p=>join(state,p,'local-dev.before/v3/marker')).find(existsSync);
  assert.equal(readFileSync(backup,'utf8'),'old sandbox');
 } finally {rmSync(dir,{recursive:true,force:true});}
});
