import {readFileSync} from 'node:fs';

export function required(name) {
  const value=process.env[name];
  if(!value)throw Error(`Missing configuration: ${name}`);
  return value;
}
export async function query(sql,params=[]) {
  const config=JSON.parse(readFileSync('wrangler.jsonc','utf8'));
  const id=config.d1_databases.find(binding=>binding.binding==='DB').database_id;
  const account=required('CLOUDFLARE_ACCOUNT_ID'),token=required('CLOUDFLARE_API_TOKEN');
  const response=await fetch(`https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(account)}/d1/database/${id}/query`,{
    method:'POST',signal:AbortSignal.timeout(30000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json'},body:JSON.stringify({sql,params}),
  });
  if(!response.ok)throw Error(`D1 operation failed (HTTP ${response.status})`);
  const body=await response.json();
  if(!body.success||!body.result?.length||body.result.some(result=>!result.success))throw Error('D1 operation failed');
  return body.result[0].results;
}
export async function notify(id,text) {
  const token=required('RESEND_API_KEY');
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json','Idempotency-Key':`operations/${id}`},
    body:JSON.stringify({from:'Åben Bane Aften <mail@aabenbaneaften.dk>',to:['christinsommer@me.com'],subject:'Åben Bane: sikkerhed og drift',text}),
  });
  if(!response.ok)throw Error(`Alarm delivery failed (HTTP ${response.status})`);
}
export async function heartbeat(name,now=Math.floor(Date.now()/1000)) {
  await query('INSERT INTO operations_health(name,succeeded_at) VALUES(?,?) ON CONFLICT(name) DO UPDATE SET succeeded_at=excluded.succeeded_at',[name,now]);
}
export const thresholds={login_failed:10,auth_limited:1,mail_sent:100,role_changed:1};
export function alarmCandidates(rows) {
  return rows.filter(row=>Object.hasOwn(thresholds,row.kind)&&row.total>=thresholds[row.kind]);
}
