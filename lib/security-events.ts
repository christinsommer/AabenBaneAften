import {getCloudflareContext} from '@opennextjs/cloudflare';

type SecurityKind='login_failed'|'auth_limited'|'mail_sent'|'role_changed';

// No PINs, tokens, addresses, membership numbers or raw IPs in these records.
// Monitoring failure must not turn a completed operation into a retry/double send.
export async function recordSecurityEvent(kind:SecurityKind,total=1,role?:{actorId:number;targetId:number;newRole:string}) {
  try {
    const db=getCloudflareContext().env.DB;
    const now=Math.floor(Date.now()/1000),bucket=Math.floor(now/900)*900;
    const queries=[db.prepare('INSERT INTO security_counters(bucket,kind,total) VALUES(?,?,?) ON CONFLICT(bucket,kind) DO UPDATE SET total=total+excluded.total').bind(bucket,kind,total)];
    if(role)queries.push(db.prepare('INSERT INTO security_role_events(id,occurred_at,actor_id,target_id,new_role) VALUES(?,?,?,?,?)').bind(crypto.randomUUID(),now,role.actorId,role.targetId,role.newRole));
    await db.batch(queries);
  }catch {
    console.error(JSON.stringify({event:'security_record_failed',kind}));
  }
}
