// OFFLINE ONLY. Produces a new reconciled copy, never imports into production.
import Database from 'better-sqlite3';
import {existsSync} from 'node:fs';
import {resolve} from 'node:path';
const [backupPath,latestPath,outputPath]=process.argv.slice(2);
if(!backupPath||!latestPath||!outputPath||process.argv.length!==5)throw Error('Usage: node scripts/privacy-restore.mjs BACKUP.sqlite LATEST-FROZEN.sqlite NEW-OUTPUT.sqlite');
if(existsSync(outputPath)||resolve(backupPath)===resolve(latestPath))throw Error('Use distinct snapshots and a new output file');
const backup=new Database(backupPath,{readonly:true}),latest=new Database(latestPath,{readonly:true});
let restored;
try{
 for(const db of [backup,latest])if(db.pragma('integrity_check',{simple:true})!=='ok')throw Error('Invalid snapshot');
 await backup.backup(outputPath);restored=new Database(outputPath);
 const ids=new Set(restored.prepare('SELECT id FROM players').all().map(r=>r.id));
 restored.transaction(()=>{
  for(const id of ids){
   const old=restored.prepare('SELECT created_at FROM players WHERE id=?').get(id),current=latest.prepare('SELECT created_at FROM players WHERE id=?').get(id);
   if(!current||current.created_at!==old.created_at)throw Error('Missing or changed identity in latest snapshot; manual reconciliation required');
  }
  // All snapshots must already have been rehearsed to the current schema.
  const closed=latest.prepare('SELECT player_id FROM profile_privacy WHERE closed_at IS NOT NULL').all();
  for(const {player_id:id}of closed){
   if(!ids.has(id))continue;
   const p=latest.prepare('SELECT * FROM players WHERE id=?').get(id),old=restored.prepare('SELECT * FROM players WHERE id=?').get(id);
   if(p.created_at!==old.created_at)throw Error('Identity mapping changed; manual restore required');
   if(restored.prepare("SELECT 1 FROM signups WHERE player_id=? UNION ALL SELECT 1 FROM feedback WHERE author_player_id=? OR subject_player_id=? UNION ALL SELECT 1 FROM substitutions WHERE outgoing_player_id=? OR replacement_player_id=? UNION ALL SELECT 1 FROM matches WHERE EXISTS(SELECT 1 FROM json_each(player_ids) WHERE value=?) UNION ALL SELECT 1 FROM match_requests WHERE creator_player_id=? OR EXISTS(SELECT 1 FROM json_each(invited_member_nos) WHERE CAST(value AS TEXT)=?) OR EXISTS(SELECT 1 FROM json_each(accepted_player_ids) WHERE value=?) UNION ALL SELECT 1 FROM events WHERE imported_kampplan<>'' AND imported_kampplan<>'[]' LIMIT 1").get(id,id,id,id,id,id,id,old.member_no,id))throw Error('Restored history could identify a closed member; manual reconciliation required');
   if(!restored.prepare('SELECT closed_at FROM profile_privacy WHERE player_id=?').get(id)?.closed_at){
    const keys=Object.keys(p).filter(k=>k!=='id');restored.prepare(`UPDATE players SET ${keys.map(k=>`"${k}"=?`).join(',')} WHERE id=?`).run(...keys.map(k=>p[k]),id);
   }
  }
  const tables=['privacy_documents','privacy_acknowledgements','profile_privacy','privacy_review_events','newsletter_events','newsletter_preferences','newsletter_tokens','newsletter_drafts','newsletter_dispatches','newsletter_recipients'];
  for(const table of [...tables].reverse())restored.prepare(`DELETE FROM "${table}"`).run();
  for(const table of tables)for(const row of latest.prepare(`SELECT * FROM "${table}"`).all()){
   if('player_id'in row&&!ids.has(row.player_id))continue;
   const keys=Object.keys(row);restored.prepare(`INSERT INTO "${table}"(${keys.map(k=>`"${k}"`).join(',')}) VALUES(${keys.map(()=>'?').join(',')})`).run(...Object.values(row));
  }
  // Old restored addresses may differ: require fresh consent, never reactivate it.
  restored.exec("UPDATE newsletter_preferences SET status='never',consent_id=NULL,paused_until=NULL WHERE consent_id IN(SELECT e.id FROM newsletter_events e JOIN players p ON p.id=e.player_id WHERE e.email<>p.email)");
  restored.exec("UPDATE newsletter_tokens SET revoked_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'); DELETE FROM sessions; DELETE FROM pin_reset_tokens; UPDATE newsletter_recipients SET status='excluded' WHERE status IN ('prepared','sending','uncertain')");
  // A newer closure must not resurrect old free-text notes or contact addresses.
  restored.exec("UPDATE privacy_review_events SET note=NULL WHERE player_id IN(SELECT player_id FROM profile_privacy WHERE closed_at IS NOT NULL); UPDATE newsletter_events SET email=NULL WHERE player_id IN(SELECT player_id FROM profile_privacy WHERE closed_at IS NOT NULL); UPDATE newsletter_recipients SET email=NULL WHERE player_id IN(SELECT player_id FROM profile_privacy WHERE closed_at IS NOT NULL)");
 })();
 if(restored.pragma('integrity_check',{simple:true})!=='ok'||restored.pragma('foreign_key_check').length)throw Error('Reconciled copy failed verification');
 console.log('Offline copy reconciled. Keep all traffic and sending disabled until external archives, later changes and identity mapping have been verified. No production import performed.');
}finally{restored?.close();latest.close();backup.close();}
