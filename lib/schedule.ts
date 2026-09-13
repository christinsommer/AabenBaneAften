import { and, asc, eq, gte, ne } from "drizzle-orm";
import { copenhagenDate } from "./calendar";
import { levelScore } from './ranking';
import { getDb } from "../db";
import { events, matches, players, signups } from "../db/schema";

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
type Person=typeof players.$inferSelect&{signupId:number;availability:string[];requestedHours:number};
function combos<T>(a:T[],n:number,s=0,p:T[]=[],o:T[][]=[]):T[][]{if(p.length===n){o.push(p);return o;}for(let i=s;i<=a.length-(n-p.length);i++)combos(a,n,i+1,[...p,a[i]],o);return o;}
function score(g:Person[]){const l=g.map(p=>levelScore(p.adminLevel??p.selfLevel));if(l.some(x=>!Number.isFinite(x)))return Infinity;if(Math.max(...l)===4&&Math.min(...l)===1)return Infinity;const women=g.filter(p=>p.gender==="K").length;return(Math.max(...l)-Math.min(...l))*100+(women===2?0:women===0||women===4?18:35);}
function arrange(g:Person[]){const parts=[[[0,1],[2,3]],[[0,2],[1,3]],[[0,3],[1,2]]];let best=g,bestScore=Infinity;for(const [a,b] of parts){const t1=[g[a[0]],g[a[1]]],t2=[g[b[0]],g[b[1]]];const diff=Math.abs(t1.reduce((s,p)=>s+levelScore(p.adminLevel??p.selfLevel),0)-t2.reduce((s,p)=>s+levelScore(p.adminLevel??p.selfLevel),0));const women=g.filter(p=>p.gender==="K").length;const mix=women===2&&(t1[0].gender===t1[1].gender)?4:0;if(diff*10+mix<bestScore){bestScore=diff*10+mix;best=[...t1,...t2];}}return best;}
export async function generateSchedule(eventId:number){const db=getDb();const rows=await db.select({signup:signups,player:players}).from(signups).innerJoin(players,eq(players.id,signups.playerId)).where(and(eq(signups.eventId,eventId),ne(signups.status,"cancelled"))).orderBy(asc(signups.createdAt));const people:Person[]=rows.filter(({signup})=>signup.requestedHours>0).map(({signup,player})=>({...player,signupId:signup.id,availability:JSON.parse(signup.availability),requestedHours:signup.requestedHours}));const locked=await db.select().from(matches).where(and(eq(matches.eventId,eventId),eq(matches.locked,true)));const occupied=new Map<string,Set<number>>(),assigned=new Set<number>();for(const m of locked){if(!occupied.has(m.startTime))occupied.set(m.startTime,new Set());occupied.get(m.startTime)!.add(m.court);for(const id of JSON.parse(m.playerIds))assigned.add(id);}await db.delete(matches).where(and(eq(matches.eventId,eventId),eq(matches.locked,false)));const groups:{people:Person[];time:string;average:number}[]=[];const open=people.filter(p=>!assigned.has(p.id));while(open.length>=4){const anchor=open[0];let best:any=null;const pool=open.slice(1).filter(p=>p.availability.some(t=>anchor.availability.includes(t)));for(const trio of combos(pool.slice(0,18),3)){const group=[anchor,...trio];const shared=TIMES.filter(t=>group.every(p=>p.availability.includes(t))&&(occupied.get(t)?.size??0)<COURTS[t].length);if(!shared.length)continue;const s=score(group);if(!best||s<best.score)best={group,time:shared[0],score:s};}if(!best||!Number.isFinite(best.score)){open.shift();continue;}const ordered=arrange(best.group);groups.push({people:ordered,time:best.time,average:ordered.reduce((s,p)=>s+levelScore(p.adminLevel??p.selfLevel),0)/4});for(const p of best.group){assigned.add(p.id);open.splice(open.findIndex(x=>x.id===p.id),1);}}for(const time of TIMES){const group=groups.filter(g=>g.time===time).sort((a,b)=>b.average-a.average);const courts=COURTS[time].filter(c=>!occupied.get(time)?.has(c));for(let i=0;i<Math.min(group.length,courts.length);i++)await db.insert(matches).values({eventId,court:courts[i],startTime:time,playerIds:JSON.stringify(group[i].people.map(p=>p.id))});}for(const p of people)await db.update(signups).set({status:assigned.has(p.id)?"active":"waitlist"}).where(eq(signups.id,p.signupId));return{matches:groups.length,waitlisted:people.length-assigned.size};}
