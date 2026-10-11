import { and, asc, eq, gte, ne } from "drizzle-orm";
import { copenhagenDate, calendarEvent } from "./calendar";
import { getDb } from "../db";
import { events, registrationDefaults } from "../db/schema";
import {initialRegistrationDefaults,parseRegistrationDefaults} from './registration-defaults';

export async function ensureEvent(now = new Date()) {
  const db = getDb();
  const [testEvent] = await db.select().from(events)
    .where(and(eq(events.testActive,true),eq(events.isTest,true),eq(events.archived,false)))
    .orderBy(asc(events.date)).limit(1);
  if (testEvent) return testEvent;

  const [next] = await db.select().from(events)
    .where(and(gte(events.date,copenhagenDate(now)),eq(events.archived,false),ne(events.status,"cancelled")))
    .orderBy(asc(events.date)).limit(1);
  if (next) {
    // Calendar dates may have been created months before defaults were changed.
    // Refresh automatic schedules until registration has actually started.
    if (!next.isTest && next.status==='draft' && next.registrationOverride==='auto' && !next.registrationScheduleCustom && now.getTime()<Date.parse(next.registrationOpensAt)) {
      const [stored]=await db.select().from(registrationDefaults).where(eq(registrationDefaults.id,1)).limit(1);
      const schedule=calendarEvent(next.date,stored?parseRegistrationDefaults(stored):initialRegistrationDefaults);
      if(schedule.registrationOpensAt!==next.registrationOpensAt||schedule.registrationClosesAt!==next.registrationClosesAt) {
        const [updated]=await db.update(events).set(schedule).where(and(eq(events.id,next.id),eq(events.registrationOpensAt,next.registrationOpensAt),eq(events.registrationClosesAt,next.registrationClosesAt),eq(events.registrationScheduleCustom,false),eq(events.registrationOverride,'auto'),eq(events.status,'draft'))).returning();
        if(updated)return updated;
        return (await db.select().from(events).where(eq(events.id,next.id)).limit(1))[0]??null;
      }
    }
    return next;
  }

  return null;
}
