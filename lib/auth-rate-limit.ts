import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sha256 } from './credentials';
import {recordSecurityEvent} from './security-events';

type Rule = { limit: number; window: number; delayAfter: number; delay: number };
const rules = {
  mfa: { ip: {limit:50, window:900, delayAfter:50, delay:0}, account: {limit:12, window:900, delayAfter:5, delay:30} },
  login: { ip: {limit:50, window:900, delayAfter:50, delay:0}, account: {limit:12, window:900, delayAfter:5, delay:30} },
  request_pin_reset: { ip: {limit:20, window:3600, delayAfter:20, delay:0}, account: {limit:3, window:3600, delayAfter:3, delay:0} },
  reset_pin: { ip: {limit:30, window:900, delayAfter:30, delay:0} },
} satisfies Record<string, {ip:Rule; account?:Rule}>;
export type LimitedAction = keyof typeof rules;

// Atomic conditional UPSERT: concurrent Workers cannot exceed the same allowance.
async function consume(db: D1Database, key: string, rule: Rule, now: number) {
  const {limit, window, delayAfter, delay} = rule;
  const row = await db.prepare(`INSERT INTO auth_rate_limits (key, attempts, expires_at, blocked_until)
    VALUES (?, 1, ?, 0)
    ON CONFLICT(key) DO UPDATE SET
      attempts = CASE WHEN expires_at <= ? THEN 1 ELSE attempts + 1 END,
      blocked_until = CASE WHEN expires_at <= ? THEN 0
        WHEN attempts + 1 >= ? THEN expires_at
        WHEN attempts + 1 >= ? THEN MIN(expires_at, ? + ? * (1 << MIN(10, attempts + 1 - ?))) ELSE 0 END,
      expires_at = CASE WHEN expires_at <= ? THEN ? ELSE expires_at END
    WHERE expires_at <= ? OR (blocked_until <= ? AND attempts < ?)
    RETURNING key`).bind(key, now+window, now, now, limit, delayAfter, now, delay, delayAfter,
      now, now+window, now, now, limit).first();
  if (row) return 0;
  const blocked = await db.prepare('SELECT blocked_until, expires_at FROM auth_rate_limits WHERE key=?')
    .bind(key).first<{blocked_until:number; expires_at:number}>();
  return Math.max(1, (blocked?.blocked_until || blocked?.expires_at || now+window) - now);
}

export async function authRateLimit(request: Request, action: LimitedAction, memberNo = '') {
  const db = getCloudflareContext().env.DB;
  const now = Math.floor(Date.now()/1000);
  // Trust only the header supplied by Cloudflare, never client-controlled forwarded headers.
  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  const rule: {ip:Rule; account?:Rule} = rules[action];
  await db.prepare('DELETE FROM auth_rate_limits WHERE key IN (SELECT key FROM auth_rate_limits WHERE expires_at <= ? LIMIT 100)')
    .bind(now).run();
  let retry = await consume(db, await sha256(`${action}:ip:${ip}`), rule.ip, now);
  if (!retry && rule.account) retry = await consume(db, await sha256(`${action}:account:${memberNo.trim()}`), rule.account, now);
  if(retry)await recordSecurityEvent('auth_limited');
  return retry ? Response.json({error:`For mange forsøg. Prøv igen om ${retry} sekunder.`}, {
    status:429, headers:{'Retry-After':String(retry),'Cache-Control':'no-store'},
  }) : null;
}
