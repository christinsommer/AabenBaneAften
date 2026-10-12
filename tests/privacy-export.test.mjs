import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readdirSync,readFileSync,rmSync,cpSync,writeFileSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {tmpdir} from 'node:os';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {verifyExport,exportLocalD1} from '../scripts/privacy-backup-lib.mjs';
test('actual local D1 engine export restores privacy tables and triggers without changing original rows',{timeout:120000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-export-'));let proxy;
 try{
  proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(dir,'v3')}});const db=proxy.env.DB;
  await db.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT)').run();
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await db.batch([...migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(q=>db.prepare(q)),db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(file)]);
  await db.prepare("INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES('synthetic-export','Synthetic Export','export@example.test','K','B','hash')").run();
  await proxy.dispose();proxy=undefined;
  await exportLocalD1(join(dir,'v3'),join(dir,'database.sql'));
  const report=verifyExport(join(dir,'database.sql'),join(dir,'restored.sqlite'));assert.equal(report.counts.players,1);assert.equal(report.counts.profile_privacy,1);assert.equal(report.repeatable,true);
 }finally{await proxy?.dispose();rmSync(dir,{recursive:true,force:true});}
});
test('existing local D1 upgrades only after a verified backup and preserves login rows',{timeout:120000},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'hik-upgrade-'));let proxy;
 try{
  const original=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  writeFileSync(join(dir,'wrangler.jsonc'),JSON.stringify({d1_databases:original.d1_databases,compatibility_date:original.compatibility_date}));cpSync('drizzle',join(dir,'drizzle'),{recursive:true});
  proxy=await getPlatformProxy({configPath:join(dir,'wrangler.jsonc'),persist:{path:join(dir,'.wrangler/local-dev/v3')}});const db=proxy.env.DB;
  await db.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY,name TEXT UNIQUE,applied_at TEXT)').run();
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')&&!f.startsWith('0016')).sort())await db.batch([...migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(q=>db.prepare(q)),db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(file)]);
  await db.prepare("INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES('preserved','Synthetic Preserved','preserved@example.test','K','B','preserved-hash')").run();
  await proxy.dispose();proxy=undefined;
  const run=spawnSync(process.execPath,[resolve('scripts/setup-local-d1.mjs')],{cwd:dir,encoding:'utf8',windowsHide:true});assert.equal(run.status,0,run.stderr);assert.match(run.stdout,/backup and restore rehearsal verified/);
  const backups=readdirSync(join(dir,'.data/privacy-backups'));assert.equal(backups.length,1);
  const report=JSON.parse(readFileSync(join(dir,'.data/privacy-backups',backups[0],'restored-rehearsal.sqlite.verification.json'),'utf8'));assert.equal(report.counts.players,1);
  proxy=await getPlatformProxy({configPath:join(dir,'wrangler.jsonc'),persist:{path:join(dir,'.wrangler/local-dev/v3')}});
  assert.equal((await proxy.env.DB.prepare('SELECT pin_hash FROM players').first()).pin_hash,'preserved-hash');assert.equal((await proxy.env.DB.prepare('SELECT activity_known FROM profile_privacy').first()).activity_known,0);
 }finally{await proxy?.dispose();rmSync(dir,{recursive:true,force:true});}
});
