import {query,notify,heartbeat,alarmCandidates} from './operations-lib.mjs';
import {pathToFileURL} from 'node:url';

export async function runMonitor({runQuery=query,send=notify,recordHeartbeat=heartbeat,now=Math.floor(Date.now()/1000)}={}) {
const query=runQuery,notify=send,heartbeat=recordHeartbeat;
const cutoff=Math.floor(now/900)*900;
// Closed 15-minute windows give stable, idempotent alert messages. Catch up after outages.
const rows=await query('SELECT bucket,kind,total FROM security_counters WHERE bucket>=? AND bucket<? ORDER BY bucket,kind',[now-7*86400,cutoff]);
const candidates=alarmCandidates(rows);
const sent=new Set((await query('SELECT id FROM security_alert_deliveries WHERE sent_at>=?',[now-8*86400])).map(row=>row.id));
const labels={login_failed:'Mislykkede loginforsøg',auth_limited:'Afvisninger pga. for mange login-/nulstillingsforsøg',mail_sent:'Mails accepteret af mailtjenesten (inkl. eventuelle genforsøg)',role_changed:'Ændringer af administratorroller'};
// One digest per original window, never one email per request.
for(const bucket of [...new Set(candidates.map(row=>row.bucket))]) {
  const id=`security-${bucket}`;
  if(sent.has(id))continue;
  const lines=candidates.filter(row=>row.bucket===bucket).map(row=>`${labels[row.kind]}: ${row.total}`);
  const roles=await query('SELECT actor_id,target_id,new_role FROM security_role_events WHERE occurred_at>=? AND occurred_at<? ORDER BY occurred_at,id',[bucket,bucket+900]);
  for(const role of roles)lines.push(`Rolleændring: bruger-ID ${role.actor_id} ændrede bruger-ID ${role.target_id} til ${role.new_role}.`);
  await notify(id,`Kontrollér aktiviteten i Åben Bane. En alarm er ikke i sig selv bevis på et angreb.\nPeriode (UTC): ${new Date(bucket*1000).toISOString()} – ${new Date((bucket+900)*1000).toISOString()}\n\n${lines.join('\n')}\n\nKontrollér Cloudflare-logs og administratoraktivitet. Ved mistanke: tilbagekald berørte sessioner og beskyt kontoen.`);
  await query('INSERT OR IGNORE INTO security_alert_deliveries(id,sent_at) VALUES(?,?)',[id,now]);
}
const [backup]=await query("SELECT succeeded_at FROM operations_health WHERE name='backup'");
if(!backup||now-backup.succeeded_at>36*3600) {
  const id=`backup-stale-${Math.floor(now/86400)}`;
  if(!sent.has(id)) {
    await notify(id,'Der er ingen bekræftet, uploadet og kontrolleret backup fra de seneste 36 timer. Kontrollér workflowet Operations backup i GitHub Actions.');
    await query('INSERT OR IGNORE INTO security_alert_deliveries(id,sent_at) VALUES(?,?)',[id,now]);
  }
}
// Bound retention: aggregate counters 8 days, role audit and delivery markers 30 days.
await query('DELETE FROM security_counters WHERE bucket<?',[now-8*86400]);
await query('DELETE FROM security_role_events WHERE occurred_at<?',[now-30*86400]);
await query('DELETE FROM security_alert_deliveries WHERE sent_at<?',[now-30*86400]);
await heartbeat('security-monitor',now);
console.log('Security monitoring completed.');
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href)await runMonitor();
