import {getCloudflareContext} from '@opennextjs/cloudflare';
import {sql} from 'drizzle-orm';
import {currentPlayer} from '../../../../lib/auth';
import {sameOrigin} from '../../../../lib/privacy-request';
import {getDb} from '../../../../db';
import {loadOptimizerInput, optimizerRevisionSql} from '../../../../lib/optimizer-server';
import {loadEventOptimizerWeights} from '../../../../lib/optimizer-defaults-server';
import {optimizerMembersSql, optimizerScheduleSql, optimizerSignupsSql} from '../../../../lib/optimizer-revision';
import {registrationIsOpen} from '../../../../lib/registration';

export const dynamic = 'force-dynamic';

async function latest(eventId: number) {
  const job = await getCloudflareContext().env.DB.prepare(`SELECT j.id,j.event_id AS eventId,j.status,j.warning,j.error,j.created_at AS createdAt,j.finished_at AS finishedAt,
    CASE WHEN json_valid(e.imported_kampplan) AND json_extract(e.imported_kampplan,'$[0]._optimizerRevision')=j.id
      THEN json_extract(e.imported_kampplan,'$[0]._optimizerSummary') ELSE NULL END AS summary
    FROM optimizer_jobs j JOIN events e ON e.id=j.event_id WHERE j.event_id=? ORDER BY j.created_at DESC,j.id DESC LIMIT 1`).bind(eventId).first<{id:string;status:string;summary:string|null}>();
  return job ? {...job,summary:job.summary?JSON.parse(String(job.summary)):null} : null;
}

export async function GET(request: Request) {
  const user = await currentPlayer();
  if (!user) return Response.json({error:'Log ind først.'},{status:401});
  if (user.role!=='admin') return Response.json({error:'Kun administratorer kan se beregninger.'},{status:403});
  const eventId = Number(new URL(request.url).searchParams.get('eventId'));
  if (!Number.isSafeInteger(eventId) || eventId<1) return Response.json({error:'Ugyldig spillerunde.'},{status:400});
  return Response.json({job:await latest(eventId)},{headers:{'Cache-Control':'no-store'}});
}

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({error:'Ugyldigt kald.'},{status:403});
  const user = await currentPlayer({touch:true});
  if (!user) return Response.json({error:'Log ind først.'},{status:401});
  if (user.role!=='admin') return Response.json({error:'Kun administratorer kan starte beregninger.'},{status:403});
  try {
    const body = await request.json() as {eventId?:number}|null;
    const eventId = body?.eventId;
    if (typeof eventId!=='number') return Response.json({error:'Ugyldig spillerunde.'},{status:400});
    if (!Number.isSafeInteger(eventId) || eventId<1) return Response.json({error:'Ugyldig spillerunde.'},{status:400});
    const env = getCloudflareContext().env as CloudflareEnv & {OPTIMIZER_URL?:string;OPTIMIZER_API_KEY?:string};
    if (!env.OPTIMIZER_URL || !env.OPTIMIZER_API_KEY) return Response.json({error:'Beregningstjenesten er ikke tilsluttet.'},{status:503});
    const existing = await latest(eventId);
    if (existing && ['queued','running'].includes(String(existing.status))) return Response.json({job:existing},{status:202});
    const health = await fetch(new URL('/jobs-health',env.OPTIMIZER_URL),{headers:{Authorization:`Bearer ${env.OPTIMIZER_API_KEY}`},signal:AbortSignal.timeout(5000)});
    if (!health.ok || (await health.json() as {jobProtocol?:number}).jobProtocol!==1)
      return Response.json({error:'Baggrundsberegning er ikke klar på serveren. Beregningstjenesten skal opdateres.'},{status:503});
    const loaded = await loadOptimizerInput(eventId,await loadEventOptimizerWeights(eventId),true,false,true);
    if (loaded.event.status==='cancelled' || registrationIsOpen(loaded.event) || (loaded.event.registrationOverride==='auto' && Date.now()<Date.parse(loaded.event.registrationClosesAt)))
      return Response.json({error:'Luk tilmeldingen, før du starter beregningen.'},{status:400});
    if (!loaded.input.players.length) return Response.json({error:'Der er ingen tilmeldte spillere.'},{status:400});
    const db = getDb();
    const [revisions] = await db.all<{scheduleRevision:string;membersRevision:string;signupsRevision:string}>(sql`SELECT ${optimizerScheduleSql()} AS scheduleRevision, ${optimizerMembersSql()} AS membersRevision, ${optimizerSignupsSql(eventId)} AS signupsRevision`);
    const snapshot = JSON.stringify({input:loaded.input,names:[...loaded.names],courtOrder:loaded.courtOrder,...revisions});
    const id = crypto.randomUUID();
    // Persist the outbox record before replying. Cron dispatches even if this browser disconnects.
    const inserted = await db.all(sql`INSERT INTO optimizer_jobs(id,event_id,status,snapshot,created_at)
      SELECT ${id},${eventId},'queued',${snapshot},${new Date().toISOString()}
      WHERE ${optimizerRevisionSql(eventId)}=${loaded.revision}
      ON CONFLICT DO NOTHING RETURNING id`);
    if (!inserted.length) {
      const concurrent = await latest(eventId);
      if (concurrent && ['queued','running'].includes(String(concurrent.status))) return Response.json({job:concurrent},{status:202});
      return Response.json({error:'Data blev ændret under opstarten. Prøv igen.'},{status:409});
    }
    return Response.json({job:await latest(eventId)},{status:202});
  } catch(error) {
    return Response.json({error:error instanceof Error?error.message:'Beregningen kunne ikke startes.'},{status:400});
  }
}
