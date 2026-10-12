import Database from 'better-sqlite3';
import {createHash} from 'node:crypto';
import {readFileSync,readdirSync,writeFileSync} from 'node:fs';
import {migrationStatements} from './migration-statements.mjs';
const quote=s=>'"'+s.replaceAll('"','""')+'"';
const hash=s=>createHash('sha256').update(s).digest('hex');
export async function exportLocalD1(persistPath,sqlPath){
 const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
 if(config.d1_databases.some(binding=>binding.remote))throw Error('Local backup refuses remote bindings');
 const {getPlatformProxy}=await import('wrangler');
 const proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:persistPath}});
 try{
  // Same engine export used by this pinned Wrangler's exportLocal implementation.
  // Its CLI cannot select --persist-to; use the explicit application binding instead.
  const dump=await proxy.env.DB.prepare('PRAGMA miniflare_d1_export(?,?,?);').bind(0,0).raw();
  if(!dump[0]?.length)throw Error('Empty local export');
  writeFileSync(sqlPath,dump[0].join('\n'),{flag:'wx'});
 }finally{await proxy.dispose();}
}
export function fingerprint(db){
 const result={};
 for(const {name} of db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','privacy_migration_checksums','_cf_KV') ORDER BY name").all()){
  const rows=db.prepare(`SELECT * FROM ${quote(name)}`).all().map(row=>JSON.stringify(row)).sort();
  result[name]={count:rows.length,hash:hash(rows.join('\n'))};
 }
 return result;
}
export function applyPending(db){
 db.exec('CREATE TABLE IF NOT EXISTS d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP)');
 db.exec('CREATE TABLE IF NOT EXISTS privacy_migration_checksums(name TEXT PRIMARY KEY,checksum TEXT NOT NULL)');
 const manifest=JSON.parse(readFileSync('drizzle/checksums.json','utf8'));
 db.transaction(()=>{
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()){
   const sql=readFileSync(`drizzle/${file}`,'utf8'),checksum=hash(sql.replaceAll('\r\n','\n'));
   if(manifest[file]!==checksum)throw Error(`Migration integrity mismatch: ${file}`);
   const prior=db.prepare('SELECT checksum FROM privacy_migration_checksums WHERE name=?').get(file);
   if(prior&&prior.checksum!==checksum)throw Error(`Changed applied migration: ${file}`);
   if(!db.prepare('SELECT 1 FROM d1_migrations WHERE name=?').get(file)){
    for(const query of migrationStatements(sql))db.exec(query);
    db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').run(file);
   }
   db.prepare('INSERT OR IGNORE INTO privacy_migration_checksums VALUES(?,?)').run(file,checksum);
  }
 })();
}
export function verifyExport(sqlPath,restoredPath){
 const db=new Database(restoredPath);
 try{
  db.exec(readFileSync(sqlPath,'utf8'));
  if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('Backup integrity check failed');
  if(db.pragma('foreign_key_check').length)throw Error('Backup contains broken references');
  const before=fingerprint(db);
  if(!before.players||!before.events||!before.signups)throw Error('Export does not contain the application database');
  applyPending(db);const after=fingerprint(db);
  for(const [table,value] of Object.entries(before))if(JSON.stringify(value)!==JSON.stringify(after[table]))throw Error(`Migration changed existing data: ${table}`);
  applyPending(db);if(JSON.stringify(after)!==JSON.stringify(fingerprint(db)))throw Error('Migration not repeatable');
  if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Migrated copy integrity check failed');
  const report={verifiedAt:new Date().toISOString(),sourceHash:hash(readFileSync(sqlPath)),counts:Object.fromEntries(Object.entries(before).map(([key,value])=>[key,value.count])),migrationPreservedExistingData:true,repeatable:true};
  writeFileSync(`${restoredPath}.verification.json`,JSON.stringify(report,null,2));return report;
 }finally{db.close();}
}
export function compareExports(beforePath,afterPath){
 const before=new Database(':memory:'),after=new Database(':memory:');
 try{
  before.exec(readFileSync(beforePath,'utf8'));after.exec(readFileSync(afterPath,'utf8'));
  const original=fingerprint(before),changed=fingerprint(after);
  for(const [table,value]of Object.entries(original))if(JSON.stringify(value)!==JSON.stringify(changed[table]))throw Error(`Live migration changed existing data: ${table}`);
  if(after.pragma('integrity_check',{simple:true})!=='ok'||after.pragma('foreign_key_check').length)throw Error('Post-migration integrity check failed');
  return Object.fromEntries(Object.entries(original).map(([table,value])=>[table,value.count]));
 }finally{before.close();after.close();}
}
