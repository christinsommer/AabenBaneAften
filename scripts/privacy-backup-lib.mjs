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
function tableColumns(db){
 return Object.fromEntries(db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','privacy_migration_checksums','_cf_KV') ORDER BY name").all().map(({name})=>[name,db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(column=>column.name)]));
}
export function fingerprint(db,columns=tableColumns(db)){
 const result={};
 for(const [name,names] of Object.entries(columns)){
  // A new column is additive; every original column and row must remain identical.
  const available=db.prepare(`PRAGMA table_info(${quote(name)})`).all().map(column=>column.name);
  if(names.some(column=>!available.includes(column))||!available.length)throw Error(`Migration removed existing schema: ${name}`);
  const rows=db.prepare(`SELECT ${names.map(quote).join(',')} FROM ${quote(name)}`).all().map(row=>JSON.stringify(row)).sort();
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
  const columns=tableColumns(db),before=fingerprint(db,columns);
  if(!before.players||!before.events||!before.signups)throw Error('Export does not contain the application database');
  applyPending(db);const after=fingerprint(db),preserved=fingerprint(db,columns);
  for(const [table,value] of Object.entries(before))if(JSON.stringify(value)!==JSON.stringify(preserved[table]))throw Error(`Migration changed existing data: ${table}`);
  applyPending(db);if(JSON.stringify(after)!==JSON.stringify(fingerprint(db)))throw Error('Migration not repeatable');
  if(db.pragma('integrity_check',{simple:true})!=='ok'||db.pragma('foreign_key_check').length)throw Error('Migrated copy integrity check failed');
  const report={verifiedAt:new Date().toISOString(),sourceHash:hash(readFileSync(sqlPath)),counts:Object.fromEntries(Object.entries(before).map(([key,value])=>[key,value.count])),migrationPreservedExistingData:true,repeatable:true};
  writeFileSync(`${restoredPath}.verification.json`,JSON.stringify(report,null,2));return report;
 }finally{db.close();}
}
function isConcurrentPrivacyActivity(before,after,table,columns){
 const select=`SELECT ${columns.map(quote).join(',')} FROM ${quote(table)}`;
 const oldRows=before.prepare(select).all(),newRows=after.prepare(select).all();
 if(table==='privacy_acknowledgements'){
  const remaining=new Map();
  for(const row of newRows){const key=JSON.stringify(row);remaining.set(key,(remaining.get(key)??0)+1);}
  return oldRows.every(row=>{const key=JSON.stringify(row),count=remaining.get(key)??0;remaining.set(key,count-1);return count>0;});
 }
 if(table==='profile_privacy'){
  if(oldRows.length!==newRows.length)return false;
  const byId=new Map(newRows.map(row=>[row.player_id,row]));
  const activityColumns=new Set(['last_active_at','activity_known','activity_type']);
  return oldRows.every(row=>{
   const next=byId.get(row.player_id);
   if(!next||columns.some(key=>!activityColumns.has(key)&&row[key]!==next[key]))return false;
   if([...activityColumns].every(key=>row[key]===next[key]))return true;
   return Date.parse(next.last_active_at)>=Date.parse(row.last_active_at)&&next.activity_known===1;
  });
 }
 return false;
}
export function verifyLiveExport(beforePath,afterPath){
 const expected=new Database(':memory:'),live=new Database(':memory:');
 try{
  expected.exec(readFileSync(beforePath,'utf8'));live.exec(readFileSync(afterPath,'utf8'));
  const columns=tableColumns(expected),original=fingerprint(expected,columns);
  applyPending(expected);
  const preserved=fingerprint(expected,columns);
  for(const table of Object.keys(original))if(JSON.stringify(original[table])!==JSON.stringify(preserved[table]))throw Error(`Migration changed existing data: ${table}`);
  // Live users can log in, register and edit data between exports. Row equality
  // is meaningful only in the isolated rehearsal, never across live snapshots.
  const schema=db=>db.prepare("SELECT type,name,tbl_name,sql FROM sqlite_master WHERE name NOT LIKE 'sqlite_%' AND name NOT GLOB '_cf_*' AND name NOT IN ('d1_migrations','privacy_migration_checksums') ORDER BY type,name").all();
  if(JSON.stringify(schema(expected))!==JSON.stringify(schema(live)))throw Error('Live database schema differs from migration rehearsal');
  const migrations=db=>db.prepare('SELECT name FROM d1_migrations ORDER BY name').all();
  if(JSON.stringify(migrations(expected))!==JSON.stringify(migrations(live)))throw Error('Live database migration history differs from rehearsal');
  if(live.pragma('integrity_check',{simple:true})!=='ok'||live.pragma('foreign_key_check').length)throw Error('Post-migration integrity check failed');
  const current=fingerprint(live,columns);
  const differences=Object.keys(original).filter(table=>JSON.stringify(original[table])!==JSON.stringify(current[table])).map(table=>({table,beforeCount:original[table].count,afterCount:current[table].count}));
  const report={verifiedAt:new Date().toISOString(),schemaMatchesRehearsal:true,integrityChecked:true,liveDataEqualityChecked:false,differences};
  writeFileSync(`${afterPath}.verification.json`,JSON.stringify(report,null,2));
  console.log('Live schema, migration history and integrity verified. Snapshot differences (not attributed to migrations):',JSON.stringify(differences));
  return report;
 }finally{expected.close();live.close();}
}
export function compareExports(beforePath,afterPath,{allowConcurrentPrivacyActivity=false}={}){
 const before=new Database(':memory:'),after=new Database(':memory:');
 try{
  before.exec(readFileSync(beforePath,'utf8'));after.exec(readFileSync(afterPath,'utf8'));
  const columns=tableColumns(before),original=fingerprint(before,columns),changed=fingerprint(after,columns);
  for(const [table,value]of Object.entries(original))if(JSON.stringify(value)!==JSON.stringify(changed[table])){
   if(allowConcurrentPrivacyActivity&&['privacy_acknowledgements','profile_privacy'].includes(table)&&isConcurrentPrivacyActivity(before,after,table,columns[table])){
    console.log(`Accepted concurrent privacy activity: ${table} (${value.count} -> ${changed[table].count} rows)`);
   }else throw Error(`Live database differs from backup: ${table}; changed existing data or unexpected concurrent writes. Inspect exports before retrying.`);
  }
  if(after.pragma('integrity_check',{simple:true})!=='ok'||after.pragma('foreign_key_check').length)throw Error('Post-migration integrity check failed');
  return Object.fromEntries(Object.entries(original).map(([table,value])=>[table,value.count]));
 }finally{before.close();after.close();}
}
