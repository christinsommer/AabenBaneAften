import {and, eq, sql} from 'drizzle-orm';
import {drizzle} from 'drizzle-orm/d1';
import {events, matches, feedback, substitutions, optimizerJobs} from '../db/schema';
import {proposalRows, scoreMatch, validateProposal, type OptimizerInput} from './optimizer';
import {applyCourtOrder, type CourtOrder} from './court-order';
import {optimizerMembersSql, optimizerScheduleSql, optimizerSignupsSql} from './optimizer-revision';

export type OptimizerSnapshot = {
  input: OptimizerInput; names: [number,string][]; courtOrder: CourtOrder;
  scheduleRevision: string; membersRevision: string; signupsRevision: string;
};
export const memberChangeWarning = 'Medlemsoplysninger blev ændret under beregningen. Kladden er beregnet med oplysningerne fra starttidspunktet. Kontrollér planen, eller lav en ny beregning, før du offentliggør den.';
export const signupChangeWarning = 'Tilmeldingerne blev ændret under beregningen. Kladden bruger tilmeldingerne fra beregningens start. Kontrollér ændringerne, eller beregn igen før offentliggørelse.';

export async function finishOptimizerJob(binding: D1Database, id: string, result: {matches: unknown; status: string; score: number}) {
  const db = drizzle(binding);
  const [job] = await db.select().from(optimizerJobs).where(eq(optimizerJobs.id,id));
  if (!job || !['queued','running'].includes(job.status)) return;
  const snapshot = JSON.parse(job.snapshot) as OptimizerSnapshot;
  if (!['OPTIMAL','FEASIBLE'].includes(result.status)) throw new Error('Beregningen fandt ingen gyldig løsning.');
  const validated = validateProposal(result.matches,snapshot.input);
  // Explicit priorities belong to the solver; do not silently apply a disabled court objective.
  const plan = validateProposal(snapshot.input.optimizerPriorities ? validated : applyCourtOrder(validated,snapshot.input,snapshot.courtOrder),snapshot.input);
  if (!plan.length) throw new Error('Beregningen fandt ingen kampe.');
  const scores = plan.map(m=>scoreMatch(m,snapshot.input,plan).score);
  if (scores.reduce((a,b)=>a+b,0)!==result.score) throw new Error('Kontrol af kampscore fejlede.');
  const names = new Map(snapshot.names);
  const summary = {status:result.status,score:result.score,historyDates:snapshot.input.history.map(r=>r.date),
    allocation:snapshot.input.players.map(p=>({id:p.id,name:names.get(p.id),memberNo:p.memberNo,status:p.status,signupOrder:p.signupOrder,
      requested:p.requestedHours,assigned:plan.filter(m=>[...m.team1,...m.team2].includes(p.id)).length})),
  };
  const rows = proposalRows(plan,new Map(snapshot.names)).map((row,index)=>({...row,_optimizerScore:scores[index],
    ...(index===0?{_optimizerRevision:id,_optimizerWeights:snapshot.input.weights,_optimizerPriorities:snapshot.input.optimizerPriorities,_optimizerSummary:summary}:{}),
  }));
  const serialized = JSON.stringify(rows);
  const active = sql`EXISTS (SELECT 1 FROM optimizer_jobs WHERE id=${id} AND status IN ('queued','running'))`;
  const saved = sql`${active} AND EXISTS (SELECT 1 FROM events WHERE id=${job.eventId} AND imported_kampplan=${serialized})`;
  const queries = [
    db.update(events).set({importedKampplan:serialized,status:'draft',publishedAt:null})
      .where(and(eq(events.id,job.eventId),active,sql`${optimizerScheduleSql()}=${snapshot.scheduleRevision}`)).returning({id:events.id}).toSQL(),
    db.delete(feedback).where(sql`${saved} AND match_id IN (SELECT id FROM matches WHERE event_id=${job.eventId} AND locked=0)`).toSQL(),
    db.delete(substitutions).where(sql`${saved} AND match_id IN (SELECT id FROM matches WHERE event_id=${job.eventId} AND locked=0)`).toSQL(),
    db.delete(matches).where(and(eq(matches.eventId,job.eventId),eq(matches.locked,false),saved)).toSQL(),
    ...plan.filter(m=>!snapshot.input.locked.some(l=>l.court===m.court&&l.startTime===m.startTime)).map(m=>({
      sql:'INSERT INTO matches(event_id,court,start_time,player_ids,locked) SELECT ?,?,?,?,0 WHERE EXISTS (SELECT 1 FROM optimizer_jobs WHERE id=? AND status IN (\'queued\',\'running\')) AND EXISTS (SELECT 1 FROM events WHERE id=? AND imported_kampplan=?)',
      params:[job.eventId,m.court,m.startTime,JSON.stringify([...m.team1,...m.team2]),id,job.eventId,serialized],
    })),
    db.update(optimizerJobs).set({status:'completed',snapshot:'',finishedAt:new Date().toISOString(),
      warning:sql`trim(
        (CASE WHEN ${optimizerMembersSql()} <> ${snapshot.membersRevision} THEN ${memberChangeWarning} ELSE '' END)
        || ' ' ||
        (CASE WHEN ${optimizerSignupsSql(job.eventId)} <> ${snapshot.signupsRevision} THEN ${signupChangeWarning} ELSE '' END)
      )`,
    }).where(and(eq(optimizerJobs.id,id),saved)).toSQL(),
  ];
  const savedResult = await binding.batch(queries.map(q=>binding.prepare(q.sql).bind(...q.params)));
  if (!savedResult[0].results.length) {
    await db.update(optimizerJobs).set({status:'failed',snapshot:'',finishedAt:new Date().toISOString(),error:'Medlemmer er oprettet eller slettet, eller spilledage, indstillinger eller kampplan er ændret. Resultatet er ikke gemt. Start en ny beregning.'})
      .where(and(eq(optimizerJobs.id,id),sql`status IN ('queued','running')`));
  }
}
