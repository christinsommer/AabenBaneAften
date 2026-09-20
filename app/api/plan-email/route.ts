import {and,asc,eq,inArray} from 'drizzle-orm';
import {getCloudflareContext} from '@opennextjs/cloudflare';
import {getDb} from '../../../db';
import {events,players,signups,matches} from '../../../db/schema';
import {currentPlayer} from '../../../lib/auth';
import {planEmail} from '../../../lib/plan-email';

export async function POST(request:Request) {
  const user=await currentPlayer();
  if(!user)return Response.json({error:'Log ind først.'},{status:401});
  if(user.role!=='admin')return Response.json({error:'Kun administratorer kan sende kampplanen.'},{status:403});
  const body=await request.json().catch(()=>null) as {eventId?:number;requestId?:string}|null;
  if(!Number.isSafeInteger(body?.eventId)||typeof body?.requestId!=='string'||! /^[a-f0-9-]{36}$/.test(body.requestId))return Response.json({error:'Ugyldig anmodning.'},{status:400});
  const db=getDb();
  const [event]=await db.select().from(events).where(eq(events.id,body.eventId!)).limit(1);
  if(!event||event.status!=='published')return Response.json({error:'Offentliggør kampplanen før afsendelse.'},{status:400});
  const stored=await db.select({id:matches.id}).from(matches).where(eq(matches.eventId,event.id)).limit(1);
  if(!stored.length&&(!event.importedKampplan||event.importedKampplan==='[]'))return Response.json({error:'Der er ingen kampplan at sende.'},{status:400});
  const recipients=await db.select({email:players.email}).from(signups).innerJoin(players,eq(signups.playerId,players.id))
    .where(and(eq(signups.eventId,event.id),inArray(signups.status,['active','waitlist']))).orderBy(asc(players.id));
  const addresses=[...new Set(recipients.map(p=>p.email.trim().toLowerCase()))];
  if(!addresses.length)return Response.json({error:'Ingen tilmeldte eller ventelistemedlemmer at sende til.'},{status:400});
  if(addresses.some(email=>! /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)))return Response.json({error:'En modtager mangler en gyldig e-mailadresse. Ret medlemsoplysningerne før afsendelse.'},{status:400});
  const apiKey=(getCloudflareContext().env as CloudflareEnv & {RESEND_API_KEY?:string}).RESEND_API_KEY;
  if(!apiKey)return Response.json({error:'E-mail er ikke konfigureret i dette miljø.'},{status:503});
  let sent=0;
  try {
    for(let i=0;i<addresses.length;i+=100) {
      if(i)await new Promise(resolve=>setTimeout(resolve,600));
      const batch=addresses.slice(i,i+100).map(to=>({...planEmail(to,event.date),to:[to],from:'Åben Bane Aften <mail@aabenbaneaften.dk>',reply_to:'aabenbaneaften@hik.dk'}));
      const response=await fetch('https://api.resend.com/emails/batch',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${apiKey}`,'Content-Type':'application/json','Idempotency-Key':`plan/${event.id}/${body.requestId}/${i}`},body:JSON.stringify(batch)});
      if(!response.ok)throw new Error(`Mailtjenesten afviste afsendelsen (HTTP ${response.status}).`);
      sent+=batch.length;
    }
    return Response.json({sent});
  }catch(error){return Response.json({error:`${sent} e-mails er bekræftet modtaget af mailtjenesten. ${error instanceof Error?error.message:'Afsendelsen fejlede.'} Prøv igen med samme knap.`,sent},{status:502});}
}
