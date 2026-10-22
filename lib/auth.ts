import {isSuperAdmin} from './superadmin';
import { and, eq, not, sql } from "drizzle-orm";
import { getDb } from "../db";
import { players, sessions } from "../db/schema";

import {closed,activity} from './privacy-service';

const COOKIE = "aaben_bane_session";
import { hex, sha256 } from "./credentials";
import {sessionPolicy} from './session-policy';
import {clearMfaChallenge,forgetTrustedDevices} from './admin-mfa';
export { hashPin, verifyPin, hashToken, verifyToken } from "./credentials";
export async function createSession(playerId: number, mfaVersion?:string) {
  if(await closed(playerId))throw Error("Profilen er lukket.");
  const { cookies } = await import("next/headers");
  const db=getDb();
  const [player]=await db.select({role:players.role}).from(players).where(eq(players.id,playerId)).limit(1);
  if(!player)throw Error('Profilen findes ikke.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32))), tokenHash = await sha256(token);
  const now = new Date(), expires = new Date(now.getTime() + sessionPolicy(player.role).absoluteMs);
  // Guard the INSERT as well as reads: a revoked proof cannot create an admin session.
  const result=await db.run(sql`INSERT INTO sessions(token_hash,player_id,created_at,last_seen_at,expires_at,mfa_version)
    SELECT ${tokenHash},${playerId},${now.toISOString()},${now.toISOString()},${expires.toISOString()},${mfaVersion??null}
    WHERE EXISTS(SELECT 1 FROM players p JOIN profile_privacy a ON a.player_id=p.id WHERE p.id=${playerId} AND a.closed_at IS NULL
      AND (p.role<>'admin' OR EXISTS(SELECT 1 FROM admin_mfa m WHERE m.player_id=p.id AND m.version=${mfaVersion??null})))`);
  if(!result.meta.changes)throw Error('Administratorlogin kræver 2FA. Log ind igen.');
  await activity(playerId,"login");
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires,
  });
}
export async function destroySession() {
  await clearMfaChallenge();
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value; if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token))); jar.delete(COOKIE);
}
export async function destroyAllSessions(playerId: number) {
  await forgetTrustedDevices(playerId);
  await getDb().delete(sessions).where(eq(sessions.playerId,playerId));
  const { cookies } = await import("next/headers");
  (await cookies()).delete(COOKIE);
}

// Current database role sets both limits. NULL activity marks legacy sessions,
// which must authenticate again. Client timestamps never determine validity.
function validSession(now: string) {
  const admin = sql`(SELECT role FROM players WHERE id = ${sessions.playerId}) = 'admin'`;
  return sql`COALESCE(
    (NOT ${admin} OR EXISTS(SELECT 1 FROM admin_mfa m WHERE m.player_id=${sessions.playerId} AND m.version=${sessions.mfaVersion})) AND
    julianday(${sessions.expiresAt}) > julianday(${now}) AND
    julianday(${sessions.createdAt}) > julianday(${now}) - CASE WHEN ${admin} THEN ${sessionPolicy('admin').absoluteMs} ELSE ${sessionPolicy('player').absoluteMs} END / 86400000.0 AND
    julianday(${sessions.lastSeenAt}) > julianday(${now}) - CASE WHEN ${admin} THEN ${sessionPolicy('admin').idleMs} ELSE ${sessionPolicy('player').idleMs} END / 86400000.0,
    0)`;
}

export async function currentPlayer({touch = false}: {touch?:boolean} = {}) {
  const {cookies} = await import('next/headers');
  const jar = await cookies(), token = jar.get(COOKIE)?.value;
  if (!token) return null;
  const db = getDb(), tokenHash = await sha256(token), now = new Date().toISOString();
  const valid = and(eq(sessions.tokenHash,tokenHash), validSession(now));
  // Conditional UPDATE cannot revive an expired or concurrently revoked session.
  if (touch) await db.update(sessions).set({lastSeenAt:sql`MAX(${sessions.lastSeenAt}, ${now})`}).where(valid);
  const [row] = await db.select({player:players}).from(sessions)
    .innerJoin(players,eq(players.id,sessions.playerId)).where(valid).limit(1);
  if (!row || await closed(row.player.id)) {
    await db.delete(sessions).where(and(eq(sessions.tokenHash,tokenHash),not(validSession(now))));
    jar.delete(COOKIE);
    return null;
  }
  return {...row.player,isSuperAdmin:isSuperAdmin(row.player)};
}

