import Database from 'better-sqlite3';
import {readFileSync,readdirSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {randomBytes,randomInt} from 'node:crypto';
import {getPlatformProxy} from 'wrangler';
import {applyPending} from './privacy-backup-lib.mjs';
import {migrationStatements} from './migration-statements.mjs';
import {hashPin,verifyPin} from '../lib/credentials.ts';
import {parseAlgorithmWeights} from '../lib/optimizer.ts';
import {parseCourtOrder,defaultCourtOrder} from '../lib/court-order.ts';
import {parsePlayTimes,defaultPlayTimes} from '../lib/play-schedule.ts';

const quote=s=>'"'+s.replaceAll('"','""')+'"';
const fields={
 players:'id member_no name first_name last_name christin_ranking cr_reviewed_at spouse_no spouse_mode birth_year email email_visible phone_visible phone phone_country_code gender self_level admin_level role pin_hash suspended_event_id created_at',
 events:'id date registration_opens_at registration_closes_at registration_schedule_custom status published_at registration_override imported_kampplan is_test test_active archived created_at',
 signups:'id event_id player_id availability requested_hours signup_order status created_at',
 matches:'id event_id court start_time player_ids locked created_at',
 substitutions:'id event_id match_id outgoing_player_id replacement_player_id status created_at updated_at',
 feedback:'id match_id author_player_id balance subject_player_id direction comment created_at',
 registration_defaults:'id open_days open_time close_days close_time',
 forbidden_pairs:'member_a member_b',
 optimizer_defaults:'id weights',
};

// Deliberately copy only named fields/tables. New tables and free-text metadata
// are never carried into Sandbox automatically.
export async function prepareSandbox({sqlPath,stage,credentials,configPath='wrangler.jsonc'}) {
 const config=JSON.parse(readFileSync(configPath,'utf8'));
 const binding=config.d1_databases?.find(b=>b.binding==='DB');
 if(!binding || config.d1_databases.some(b=>b.remote||b.database_id!==binding.database_id))throw Error('Expected local aliases of DB; remote bindings are forbidden.');
 if(existsSync(stage))throw Error('Staging directory already exists.');
 const source=new Database(':memory:');let proxy;
 try {
  source.exec(readFileSync(sqlPath,'utf8'));
  const known=new Set(readdirSync('drizzle').filter(f=>f.endsWith('.sql')));
  for(const row of source.prepare('SELECT name FROM d1_migrations').all())if(!known.has(row.name))throw Error('Production schema is newer than this checkout. Update the code first.');
  applyPending(source);
  if(source.pragma('integrity_check',{simple:true})!=='ok'||source.pragma('foreign_key_check').length)throw Error('Source database failed integrity checks.');
  const members=source.prepare('SELECT * FROM players ORDER BY id').all();
  const nameIds=new Map();
  const normalize=s=>s.normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('da-DK');
  for(const p of members){const k=normalize(p.name);nameIds.set(k,[...(nameIds.get(k)??[]),p.id]);}
  const memberNumbers=new Map(members.map(p=>[String(p.member_no),String(10000000+p.id)]));
  const alias=id=>`Testspiller ${id}`;
  const aliasName=name=>{
   if(!name)return '';
   const ids=nameIds.get(normalize(String(name)));
   if(ids?.length!==1)throw Error('A historical plan contains an unknown or ambiguous name. Resolve it before refreshing Sandbox.');
   return alias(ids[0]);
  };
  const disabledHash=await hashPin(randomBytes(32).toString('hex'));
  const adminId=Math.max(0,...members.map(p=>p.id))+1,playerId=adminId+1;
  const tableRows={};
  for(const [table,list] of Object.entries(fields))tableRows[table]=source.prepare(`SELECT ${list.split(' ').map(quote).join(',')} FROM ${quote(table)}`).all();
  tableRows.players=tableRows.players.map(p=>({...p,member_no:memberNumbers.get(p.member_no),name:alias(p.id),first_name:'Testspiller',last_name:String(p.id),email:`player-${p.id}@example.invalid`,phone:'',phone_country_code:'+45',email_visible:0,phone_visible:0,role:'player',pin_hash:disabledHash,
   spouse_no:p.spouse_no==null?null:Number(memberNumbers.get(String(p.spouse_no))??0)||null,
   spouse_mode:p.spouse_no!=null&&memberNumbers.has(String(p.spouse_no))?p.spouse_mode:null}));
  for(const [id,no,role,pin] of [[adminId,'90000001','admin',credentials.adminPin],[playerId,'90000002','player',credentials.playerPin]]) {
   tableRows.players.push({id,member_no:no,name:role==='admin'?'Sandbox Admin':'Sandbox Medlem',first_name:'Sandbox',last_name:role==='admin'?'Admin':'Medlem',email:`${role}@example.invalid`,gender:'M',self_level:'B',christin_ranking:5,birth_year:1980,role,pin_hash:await hashPin(pin)});
  }
  tableRows.events=tableRows.events.map(e=>{
   if(!e.imported_kampplan)return e;
   const rows=JSON.parse(e.imported_kampplan||'[]');
   if(!Array.isArray(rows))throw Error('Invalid imported plan.');
   const native=source.prepare('SELECT * FROM matches WHERE event_id=?').all(e.id);
   return {...e,imported_kampplan:JSON.stringify(rows.map(row=>{
    const game=rows[0]?._optimizerRevision?native.find(m=>m.court===Number(String(row.C).replace(/\D/g,''))&&m.start_time===String(row.A).replace('.',':')):null;
    const ids=game?JSON.parse(game.player_ids):null;
    const names=ids? (ids.length===2?[alias(ids[0]),'',alias(ids[1]),'']:ids.map(alias)):['D','E','F','G'].map(k=>aliasName(row[k]));
    return {A:row.A,B:row.B,C:row.C,D:names[0],E:names[1],F:names[2],G:names[3]};
   }))};
  });
  tableRows.feedback=tableRows.feedback.map(row=>({...row,comment:''}));
  tableRows.optimizer_defaults=tableRows.optimizer_defaults.map(row=>{
   const settings=JSON.parse(row.weights);
   return {id:row.id,weights:JSON.stringify({...parseAlgorithmWeights(settings),courtOrder:parseCourtOrder(settings.courtOrder??defaultCourtOrder),playTimes:parsePlayTimes(settings.playTimes??defaultPlayTimes)})};
  });
  tableRows.forbidden_pairs=tableRows.forbidden_pairs.flatMap(row=>{
   const pair=[memberNumbers.get(row.member_a),memberNumbers.get(row.member_b)];
   return pair.every(Boolean)?[{member_a:pair.sort()[0],member_b:pair[1]}]:[];
  });
  proxy=await getPlatformProxy({configPath,persist:{path:join(stage,'v3')}});
  const db=proxy.env.DB;
  await db.prepare('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY AUTOINCREMENT,name TEXT NOT NULL UNIQUE,applied_at TEXT DEFAULT CURRENT_TIMESTAMP)').run();
  for(const file of [...known].sort())await db.batch([...migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)),db.prepare('INSERT INTO d1_migrations(name) VALUES(?)').bind(file)]);
  // Migrations seed defaults. Replace only these explicitly selected tables.
  for(const table of ['registration_defaults','forbidden_pairs','events','optimizer_defaults'])await db.prepare(`DELETE FROM ${table}`).run();
  for(const [table,rows] of Object.entries(tableRows)) {
   const statements=rows.map(row=>{const keys=Object.keys(row);return db.prepare(`INSERT INTO ${quote(table)} (${keys.map(quote).join(',')}) VALUES (${keys.map(()=>'?').join(',')})`).bind(...Object.values(row));});
   for(let i=0;i<statements.length;i+=100)await db.batch(statements.slice(i,i+100));
   const actual=await db.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).first();
   if(actual.n!==rows.length)throw Error(`Row count mismatch: ${table}`);
  }
  // Reapply closed status only after importing historical signups.
  for(const row of source.prepare('SELECT player_id,closed_at FROM profile_privacy WHERE closed_at IS NOT NULL').all())await db.prepare('UPDATE profile_privacy SET closed_at=? WHERE player_id=?').bind(row.closed_at,row.player_id).run();
  for(const table of ['sessions','pin_reset_tokens','admin_mfa','mfa_challenges','trusted_devices','optimizer_jobs','newsletter_dispatches','newsletter_recipients','newsletter_tokens']) {
   if((await db.prepare(`SELECT count(*) AS n FROM ${table}`).first()).n!==0)throw Error(`Unexpected queued or authentication data: ${table}`);
  }
  for(const [id,pin] of [[adminId,credentials.adminPin],[playerId,credentials.playerPin]])if(!await verifyPin(pin,(await db.prepare('SELECT pin_hash FROM players WHERE id=?').bind(id).first()).pin_hash))throw Error('Sandbox test login validation failed.');
  if((await db.prepare('PRAGMA foreign_key_check').all()).results.length)throw Error('Sandbox has broken foreign keys.');
  // D1 disallows integrity_check; verify its actual exported state in SQLite.
  const dump=await db.prepare('PRAGMA miniflare_d1_export(?,?,?);').bind(0,0).raw();
  const verified=new Database(':memory:');
  try {
   verified.exec(dump[0].join('\n'));
   if(verified.pragma('integrity_check',{simple:true})!=='ok'||verified.pragma('foreign_key_check').length)throw Error('Sandbox integrity check failed.');
  } finally {verified.close();}
  return {adminId,playerId,adminMemberNo:'90000001',playerMemberNo:'90000002',counts:Object.fromEntries(Object.entries(tableRows).map(([k,v])=>[k,v.length])),verifiedAt:new Date().toISOString()};
 } finally {await proxy?.dispose();source.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
 const [sqlPath,stage,reportPath]=process.argv.slice(2);
 if(!sqlPath||!stage||!reportPath)throw Error('Usage: sandbox-copy.mjs SOURCE.sql NEW-STAGE REPORT.json');
 mkdirSync('.data/sandbox-refresh',{recursive:true});
 const file='.data/sandbox-refresh/test-logins.json';
 const credentials=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{adminPin:String(randomInt(1000,10000)),playerPin:String(randomInt(1000,10000))};
 if(!/^\d{4}$/.test(credentials.adminPin)||!/^\d{4}$/.test(credentials.playerPin))throw Error('Invalid local test PIN configuration.');
 if(!existsSync(file))writeFileSync(file,JSON.stringify(credentials,null,2),{flag:'wx',mode:0o600});
 const report=await prepareSandbox({sqlPath,stage,credentials});
 writeFileSync(reportPath,JSON.stringify(report,null,2),{flag:'wx'});
 console.log('Sanitized Sandbox prepared and verified. Test PINs are in .data/sandbox-refresh/test-logins.json.');
}
