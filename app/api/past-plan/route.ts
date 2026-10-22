import {asc,eq} from 'drizzle-orm';
import {currentPlayer} from '../../../lib/auth';
import {getDb} from '../../../db';
import {events,matches,players} from '../../../db/schema';
import {copenhagenDate} from '../../../lib/calendar';
import {normalizeKampplanRows} from '../../../lib/kampplan-rows';

export async function GET(request: Request) {
  const user=await currentPlayer();
  if (!user) return Response.json({error:'Log ind først.'},{status:401});
  if (user.role!=='admin') return Response.json({error:'Kun administratorer kan se tidligere kampplaner.'},{status:403});
  const id=Number(new URL(request.url).searchParams.get('eventId'));
  if (!Number.isSafeInteger(id)||id<1) return Response.json({error:'Ugyldig spilledag.'},{status:400});
  const db=getDb();
  const [event]=await db.select().from(events).where(eq(events.id,id)).limit(1);
  if (!event) return Response.json({error:'Spilledagen findes ikke.'},{status:404});
  if (event.date>=copenhagenDate() || event.testActive) return Response.json({error:'Spilledagen er ikke afsluttet endnu.'},{status:400});
  let rows: Record<string,unknown>[]=[];
  try { rows=normalizeKampplanRows(JSON.parse(event.importedKampplan||'[]')); } catch { /* Fall back to stored matches. */ }
  if (!rows.length) {
    const stored=await db.select().from(matches).where(eq(matches.eventId,id)).orderBy(asc(matches.startTime),asc(matches.court));
    const members=await db.select({id:players.id,name:players.name}).from(players);
    const names=new Map(members.map(p=>[p.id,p.name]));
    rows=stored.map(match=>{
      const ids=JSON.parse(match.playerIds) as number[];
      const half=ids.length/2;
      const name=(index:number)=>ids[index]===undefined?'':names.get(ids[index])??'Slettet medlem';
      const [h,m]=match.startTime.split(':').map(Number);
      return {A:match.startTime,B:`${String(h+1).padStart(2,'0')}:${String(m).padStart(2,'0')}`,C:String(match.court),D:name(0),E:half===2?name(1):'',F:name(half),G:half===2?name(half+1):''};
    });
  }
  return Response.json({rows},{headers:{'Cache-Control':'no-store'}});
}
