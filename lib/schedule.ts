import { and, asc, eq, gte, ne } from "drizzle-orm";
import { copenhagenDate } from "./calendar";
import { getDb } from "../db";
import { events } from "../db/schema";

export const TIMES = ["18:00", "18:30", "19:00", "19:30", "20:00", "20:30", "21:00"];
export const COURTS: Record<string, number[]> = { "18:00": [1,2,3,4], "19:00": [1,2,3,4], "20:00": [1,2,3,4], "21:00": [1,2,3,4], "18:30": [5,6,7], "19:30": [5,6,7], "20:30": [5,6,7] };
export async function ensureEvent() {
  const db = getDb();
  const [testEvent] = await db.select().from(events)
    .where(and(eq(events.testActive,true),eq(events.isTest,true),eq(events.archived,false)))
    .orderBy(asc(events.date)).limit(1);
  if (testEvent) return testEvent;

  const [next] = await db.select().from(events)
    .where(and(gte(events.date,copenhagenDate()),eq(events.archived,false),ne(events.status,"cancelled")))
    .orderBy(asc(events.date)).limit(1);
  if (next) return next;

  return null;
}
