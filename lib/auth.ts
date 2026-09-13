import { and, eq, gt } from "drizzle-orm";
import { getDb } from "../db";
import { players, sessions } from "../db/schema";

const COOKIE = "aaben_bane_session";
import { hex, sha256 } from "./credentials";
export { hashPin, verifyPin, hashToken, verifyToken } from "./credentials";
export async function createSession(playerId: number) {
  const { cookies } = await import("next/headers");
  const token = hex(crypto.getRandomValues(new Uint8Array(32))); const tokenHash = await sha256(token); const expires = new Date(Date.now() + 30 * 86400000);
  await getDb().insert(sessions).values({ tokenHash, playerId, expiresAt: expires.toISOString() });
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
export async function currentPlayer() {
  const { cookies } = await import("next/headers");
  const token = (await cookies()).get(COOKIE)?.value; if (!token) return null;
  const rows = await getDb().select({ player: players }).from(sessions).innerJoin(players, eq(players.id, sessions.playerId)).where(and(eq(sessions.tokenHash, await sha256(token)), gt(sessions.expiresAt, new Date().toISOString()))).limit(1);
  return rows[0]?.player ?? null;
}

