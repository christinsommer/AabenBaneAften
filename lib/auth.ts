import {isSuperAdmin} from './superadmin';
import { and, eq, not, sql } from "drizzle-orm";
import { getDb } from "../db";
import { players, sessions } from "../db/schema";

import {closed,activity} from './privacy-service';

const COOKIE = "aaben_bane_session";
import { hex, sha256 } from "./credentials";
import {sessionPolicy} from './session-policy';
export { hashPin, verifyPin, hashToken, verifyToken } from "./credentials";
export async function createSession(playerId: number) {
  if(await closed(playerId))throw Error("Profilen er lukket.");
  const { cookies } = await import("next/headers");
  const db=getDb();
  const [player]=await db.select({role:players.role}).from(players).where(eq(players.id,playerId)).limit(1);
  if(!player)throw Error('Profilen findes ikke.');
  const token = hex(crypto.getRandomValues(new Uint8Array(32))), tokenHash = await sha256(token);
  const now = new Date(), expires = new Date(now.getTime() + sessionPolicy(player.role).absoluteMs);
  await db.insert(sessions).values({ tokenHash, playerId, createdAt:now.toISOString(), lastSeenAt:now.toISOString(), expiresAt: expires.toISOString() });
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
  const { cookies } = await import("next/headers");
  const jar = await cookies();
  const token = jar.get(COOKIE)?.value; if (token) await getDb().delete(sessions).where(eq(sessions.tokenHash, await sha256(token))); jar.delete(COOKIE);
}
export async function destroyAllSessions(playerId: number) {
  await getDb().delete(sessions).where(eq(sessions.playerId,playerId));
  const { cookies } = await import("next/headers");
  (await cookies()).delete(COOKIE);
}

// Current database role sets both limits. NULL activity marks legacy sessions,
// which must authenticate again. Client timestamps never determine validity.
function validSession(now: string) {
  const admin = sql`(SELECT role FROM players WHERE id = ${sessions.playerId}) = 'admin'`;
  return sql`COALESCE(
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

