import { and, asc, count, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { optimizerDefaults, registrationDefaults, events, feedback, matches, matchRequests, pinResetTokens, players, sessions, signups, substitutions } from "../../../db/schema";
import { createSession, currentPlayer, destroySession, hashPin, hashToken, verifyPin, verifyToken } from "../../../lib/auth";
import { ensureEvent, TIMES } from "../../../lib/schedule";
import { sendEmail } from "../../../lib/email";
import { sendWelcomeEmail } from "../../../lib/welcome-email";
import { firstMatchInstant, waitlistIsOpen, registrationIsOpen, registrationSchedule } from "../../../lib/registration";
import { spouseSettings } from '../../../lib/spouse-settings';
import { profileValues } from "../../../lib/profile";
import {initialRegistrationDefaults,parseRegistrationDefaults} from '../../../lib/registration-defaults';
import { calendarEvent, validDate } from "../../../lib/calendar";
import { signupInput, signupFields, noSignup } from "../../../lib/signup";
import { visiblePlanContact } from '../../../lib/contact-visibility';
import { visibleMember } from "../../../lib/member-visibility";
import { initialCr } from '../../../lib/initial-cr';
import { levelScore } from '../../../lib/ranking';
import { buildSignupExportRows } from "../../../lib/export-signups";
import { normalizeKampplanRows } from "../../../lib/kampplan-rows";
import {parseAlgorithmWeights, scoreMatch} from '../../../lib/optimizer';
import {loadOptimizerInput} from '../../../lib/optimizer-server';

import {loadOptimizerDefaults} from '../../../lib/optimizer-defaults-server';

export const dynamic = "force-dynamic";

function parseImportedKampplan(raw: unknown) {
  if (typeof raw !== "string" || !raw.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return normalizeKampplanRows(parsed);
  } catch {
    return [];
  }
}

function resetLinkEmail(to: string, token: string) {
  const baseUrl = process.env.APP_URL || "https://aabenbaneaften.dk";
  const resetUrl = `${baseUrl}/?reset=${encodeURIComponent(token)}`;
  return {
    to,
    subject: "Nulstil din pinkode til Åben Bane Aften",
    text: `Hej\n\nDer blev anmodet om nulstilling af din pinkode til Åben Bane Aften.\nKlik på linket for at vælge en ny kode:\n\n${resetUrl}\n\nLinket er gyldigt i 60 minutter.\n\nHvis du ikke har anmodet om dette, kan du ignorere denne e-mail.`,
    html: `<p>Hej</p><p>Der blev anmodet om nulstilling af din pinkode til Åben Bane Aften.</p><p><a href="${resetUrl}">Klik her for at vælge en ny kode</a></p><p>Linket er gyldigt i 60 minutter.</p><p>Hvis du ikke har anmodet om dette, kan du ignorere denne e-mail.</p>`,
  };
}

async function eventFirstMatchAt(event: typeof events.$inferSelect) {
  const stored = await getDb().select({startTime:matches.startTime}).from(matches).where(eq(matches.eventId,event.id));
  const imported = parseImportedKampplan(event.importedKampplan);
  const starts = imported.length ? imported.map(row => String(row.A)) : stored.map(row => row.startTime);
  return firstMatchInstant(event.date, starts.length ? starts : TIMES);
}

async function loadRegistrationDefaults() {
  const [stored] = await getDb().select().from(registrationDefaults).where(eq(registrationDefaults.id,1)).limit(1);
  return stored ? parseRegistrationDefaults(stored) : initialRegistrationDefaults;
}

async function state() {
  const db = getDb(); const storedEvent = await ensureEvent(); const user = await currentPlayer();
  const event = storedEvent ? {...storedEvent, importedKampplan: user?.role === 'admin' || storedEvent.status === 'published' ? storedEvent.importedKampplan : ''} : null;
  const isOpen = event ? registrationIsOpen(event) : false;
  const importedMatches = event && (user?.role === 'admin' || event.status === 'published') ? parseImportedKampplan(event.importedKampplan) : [];
  const defaultWeights = user?.role === 'admin' ? await loadOptimizerDefaults() : undefined;
  let optimizerWeights = defaultWeights;
  let adminPlanScores: (number | null)[] | undefined;
  if (user?.role === 'admin' && importedMatches.length && event) {
    const raw = JSON.parse(event.importedKampplan);
    try { if (raw[0]?._optimizerWeights) optimizerWeights = parseAlgorithmWeights(raw[0]._optimizerWeights); } catch { /* Older plan metadata. */ }
    if (raw.length === importedMatches.length && raw.every((row: Record<string, unknown>) => Number.isSafeInteger(row._optimizerScore))) {
      adminPlanScores = raw.map((row: {_optimizerScore: number}) => row._optimizerScore);
    } else {
      adminPlanScores = importedMatches.map(() => null);
      try {
        const {input, names} = await loadOptimizerInput(event.id, optimizerWeights ?? {}, true);
        const resolveName = (name: string) => {
          const normalized = (s: string) => s.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
          const ids = [...names].filter(([, value]) => normalized(value) === normalized(name)).map(([id]) => id);
          if (ids.length !== 1 || !input.players.some(p => p.id === ids[0])) throw new Error('Ukendt spiller');
          return ids[0];
        };
        adminPlanScores = importedMatches.map(row => {
          try { return scoreMatch({court: Number(row.C.replace(/\D/g, '')), startTime: row.A,
            team1: [row.D, row.E].filter(Boolean).map(resolveName), team2: [row.F, row.G].filter(Boolean).map(resolveName)}, input).score; }
          catch { return null; }
        });
      } catch { /* Missing CR/history: show an unavailable score rather than a made-up number. */ }
    }
  }
  // Per-match scores and factors belong only in the administrator's view.
  if (event && user?.role !== 'admin' && event.importedKampplan) event.importedKampplan = JSON.stringify(importedMatches);
  if (!user) return { authenticated: false, event, isOpen, times: TIMES, importedMatches };
  const defaults = user.role === 'admin' ? await loadRegistrationDefaults() : undefined;
  const calendarDates = await db.select({id:events.id,date:events.date,status:events.status,isTest:events.isTest,testActive:events.testActive}).from(events).where(eq(events.archived,false)).orderBy(asc(events.date));
  const allPlayers = user.role === "admin" ? await db.select({id:players.id,memberNo:players.memberNo,name:players.name,firstName:players.firstName,lastName:players.lastName,email:players.email,phone:players.phone,phoneCountryCode:players.phoneCountryCode,emailVisible:players.emailVisible,phoneVisible:players.phoneVisible,christinRanking:players.christinRanking,crReviewedAt:players.crReviewedAt,spouseNo:players.spouseNo,spouseMode:players.spouseMode,createdAt:players.createdAt,birthYear:players.birthYear,gender:players.gender,selfLevel:players.selfLevel,adminLevel:players.adminLevel,role:players.role,suspendedEventId:players.suspendedEventId}).from(players).orderBy(asc(players.name)) : [];
  if (!event) return {authenticated:true,user:visibleMember(user),event:null,isOpen:false,times:TIMES,calendarDates,registeredMembers:[],importedMatches: [],players:allPlayers,optimizerDefaults:defaultWeights,registrationDefaults:defaults};
  const registeredMembers = await db.select({id:players.id,name:players.name}).from(signups)
    .innerJoin(players,eq(players.id,signups.playerId))
    .where(and(eq(signups.eventId,event.id),eq(signups.status,'active'),gt(signups.requestedHours,0)))
    .orderBy(asc(players.name));
  const firstMatchAt = await eventFirstMatchAt(storedEvent!);
  const signup = (await db.select().from(signups).where(and(eq(signups.eventId,event.id),eq(signups.playerId,user.id))).limit(1))[0] ?? null;
  const eventMatches = user.role === "admin" || event.status === "published" ? await db.select().from(matches).where(eq(matches.eventId,event.id)).orderBy(asc(matches.startTime),asc(matches.court)) : [];
  const eventSignups = user.role === "admin" ? await db.select({signup:signups,player:{id:players.id,name:players.name,memberNo:players.memberNo,gender:players.gender,selfLevel:players.selfLevel,adminLevel:players.adminLevel}}).from(signups).innerJoin(players,eq(players.id,signups.playerId)).where(eq(signups.eventId,event.id)).orderBy(asc(signups.createdAt)) : [];
  const signupByPlayer = new Map(eventSignups.map(row=>[row.player.id,row.signup]));
  const memberSignups = allPlayers.map(player=>{
    const row=signupByPlayer.get(player.id);
    return {player,signup:row?{...row,...signupFields(row)}:noSignup(event.id,player.id)};
  }).sort((a,b)=>(a.signup.nHours > 0 ? a.signup.signupOrder ?? Infinity : Infinity) - (b.signup.nHours > 0 ? b.signup.signupOrder ?? Infinity : Infinity));
  const signupHistory = user.role === "admin" ? await db.select({
    signup:{id:signups.id,availability:signups.availability,requestedHours:signups.requestedHours,status:signups.status,createdAt:signups.createdAt,signupOrder:signups.signupOrder},
    player:{id:players.id,name:players.name,memberNo:players.memberNo,gender:players.gender,selfLevel:players.selfLevel,adminLevel:players.adminLevel,christinRanking:players.christinRanking},
    event:{id:events.id,date:events.date,status:events.status},
  }).from(signups).innerJoin(players,eq(players.id,signups.playerId)).innerJoin(events,eq(events.id,signups.eventId)).where(ne(signups.eventId,event.id)).orderBy(desc(events.date),asc(signups.signupOrder),asc(signups.id)) : [];
  const waitlist = await db.select({
    id:players.id,
    name:players.name,
    email:sql<string>`CASE WHEN ${players.emailVisible} = 1 THEN ${players.email} ELSE '' END`,
    level:players.selfLevel,
    availability:signups.availability,
  }).from(signups).innerJoin(players,eq(players.id,signups.playerId)).where(and(eq(signups.eventId,event.id),eq(signups.status,"waitlist"))).orderBy(asc(signups.createdAt));
  const names = await db.select({id:players.id,name:players.name,firstName:players.firstName}).from(players);
  const normalizeContactName = (name: string) => name.normalize('NFKC').trim().replace(/\s+/g, ' ').toLocaleLowerCase('da-DK');
  const planNames = new Set(importedMatches.flatMap(row => ['D','E','F','G'].map(key => normalizeContactName(String(row[key] ?? '')))).filter(Boolean));
  const planIds = new Set<number>(eventMatches.flatMap(match => JSON.parse(match.playerIds)));
  const contactRows = user.role === 'admin' || event.status === 'published'
    ? await db.select({id:players.id,name:players.name,email:players.email,phone:players.phone,phoneCountryCode:players.phoneCountryCode,emailVisible:players.emailVisible,phoneVisible:players.phoneVisible}).from(players) : [];
  const planContacts = contactRows.filter(player => planIds.has(player.id) || planNames.has(normalizeContactName(player.name))).map(visiblePlanContact);
  const namesById = new Map(names.map(player => [player.id, player.name]));
  const substitutionRows = await db.select().from(substitutions).where(eq(substitutions.eventId,event.id)).orderBy(desc(substitutions.updatedAt));
  const substitutionsForUser = substitutionRows.filter((item)=>user.role==="admin"||item.outgoingPlayerId===user.id).map((item)=>({
    ...item,
    outgoingName:namesById.get(item.outgoingPlayerId)??"Ukendt spiller",
    replacementName:item.replacementPlayerId?namesById.get(item.replacementPlayerId)??"Ukendt spiller":null,
  }));
  const requestRows = await db.select({request:matchRequests,creatorName:players.name}).from(matchRequests).innerJoin(players,eq(players.id,matchRequests.creatorPlayerId)).where(eq(matchRequests.eventId,event.id));
  const requests = requestRows.filter(({request})=>request.creatorPlayerId===user.id||JSON.parse(request.invitedMemberNos).includes(user.memberNo)).map(({request,creatorName})=>({id:request.id,creatorName,status:request.status,isCreator:request.creatorPlayerId===user.id,isInvited:JSON.parse(request.invitedMemberNos).includes(user.memberNo),accepted:JSON.parse(request.acceptedPlayerIds).includes(user.id),acceptedCount:JSON.parse(request.acceptedPlayerIds).length}));
  return { authenticated:true,user:visibleMember(user),event,isOpen,firstMatchAt,times:TIMES,calendarDates,registeredMembers,importedMatches,optimizerWeights,adminPlanScores,signup:signup?{...signup,...signupFields(signup)}:noSignup(event.id,user.id),matches:event.status==="published"?eventMatches:[],adminMatches:user.role==="admin"?eventMatches:[],players:allPlayers,signups:memberSignups,signupHistory:signupHistory.map(row=>({...row,signup:{...row.signup,...signupFields(row.signup)}})),waitlist,names,planContacts,requests,optimizerDefaults:defaultWeights,registrationDefaults:defaults,substitutions:substitutionsForUser };
}

export async function GET(){try{return Response.json(await state());}catch(error){return Response.json({error:error instanceof Error?error.message:"Appen kunne ikke indlæses"},{status:500});}}

export async function POST(request:Request){
  try{
    const db=getDb(); const body=await request.json() as Record<string,any>; const action=String(body.action??"");
    if(action==="request_pin_reset"){
      const memberNo=String(body.memberNo??"").trim();
      if(!memberNo)return Response.json({error:"Angiv dit medlemsnummer."},{status:400});
      const [player]=await db.select().from(players).where(eq(players.memberNo,memberNo)).limit(1);
      // Do not reveal whether a membership number exists.
      if(!player || !player.email.trim())return Response.json({ok:true});
      const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,"0")).join("");
      const tokenHash=await hashToken(token);
      await db.insert(pinResetTokens).values({playerId:player.id,tokenHash,expiresAt:new Date(Date.now()+30*60*1000).toISOString()});
      // Use the configured public site, never an untrusted Host header.
      const link=`https://aabenbaneaften.dk/?reset=${token}`;
      try{
        await sendEmail({to:player.email,subject:"Vælg en ny PIN-kode til Åben Bane Aften",
          text:`Du har bedt om en ny PIN-kode. Åbn dette link for at vælge en ny kode: ${link}\nLinket kan bruges én gang og udløber om 30 minutter. Hvis du ikke har bedt om dette, kan du ignorere e-mailen.`,
          html:`<p>Du har bedt om en ny PIN-kode til Åben Bane Aften.</p><p><a href="${link}">Vælg en ny PIN-kode</a></p><p>Linket kan bruges én gang og udløber om 30 minutter. Hvis du ikke har bedt om dette, kan du ignorere e-mailen.</p>`});
      }catch{
        await db.delete(pinResetTokens).where(eq(pinResetTokens.tokenHash,tokenHash));
        return Response.json({error:"E-mailen kunne ikke sendes. Prøv igen senere, eller kontakt administratoren."},{status:502});
      }
      return Response.json({ok:true});
    }else if(action==="reset_pin"){
      const token=String(body.token??""),pin=String(body.pin??"");
      if(!/^\d{4,8}$/.test(pin))return Response.json({error:"Vælg en PIN-kode på 4–8 cifre."},{status:400});
      if(pin!==String(body.confirmPin??""))return Response.json({error:"De to PIN-koder stemmer ikke overens."},{status:400});
      if(!/^[a-f0-9]{64}$/.test(token))return Response.json({error:"Reset-linket er ugyldigt eller udløbet. Bestil et nyt link."},{status:400});
      const tokenHash=await hashToken(token),pinHash=await hashPin(pin);
      const validToken=and(eq(pinResetTokens.tokenHash,tokenHash),gt(pinResetTokens.expiresAt,new Date().toISOString()));
      const owner=db.select({id:pinResetTokens.playerId}).from(pinResetTokens).where(validToken);
      // D1 executes the batch atomically: concurrent requests cannot reuse a link.
      const [changed]=await db.batch([
        db.update(players).set({pinHash}).where(sql`${players.id} in (${owner})`).returning({id:players.id}),
        db.delete(sessions).where(sql`${sessions.playerId} in (${owner})`),
        db.delete(pinResetTokens).where(sql`${pinResetTokens.playerId} in (${owner})`),
      ]);
      if(!changed.length)return Response.json({error:"Reset-linket er ugyldigt eller udløbet. Bestil et nyt link."},{status:400});
      return Response.json({ok:true});
    }else if(action==="register"){
      const memberNo=String(body.memberNo??"").trim(),pin=String(body.pin??"");
      let profile;
      try { profile=profileValues(body); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Kontrollér profilen."},{status:400}); }
      if(!["M","K"].includes(body.gender)||!/^\d{4,8}$/.test(pin))return Response.json({error:"Vælg køn og en kode på 4–8 cifre."},{status:400});
      const [existing]=await db.select({id:players.id}).from(players).where(eq(players.memberNo,memberNo)).limit(1);
      if(existing)return Response.json({error:"Medlemsnummeret er allerede oprettet. Vælg “Log ind” og brug din personlige kode."},{status:409});
      const [{value}]=await db.select({value:count()}).from(players);
      const [created]=await db.insert(players).values({...profile,christinRanking:initialCr(profile.selfLevel),gender:body.gender,role:value===0?"admin":"player",pinHash:await hashPin(pin)}).returning(); await createSession(created.id);
      const warning = await sendWelcomeEmail(created.email, sendEmail);
      return NextResponse.json({...await state(), ...(warning ? {warning} : {})});
    }else if(action==="login"){
      const [player]=await db.select().from(players).where(eq(players.memberNo,String(body.memberNo??"").trim())).limit(1);
      if(!player||!(await verifyPin(String(body.pin??""),player.pinHash)))return Response.json({error:"Medlemsnummer eller kode er forkert."},{status:401}); await createSession(player.id);
    }else if(action==="logout"){await destroySession();return Response.json({ok:true});}
    else{
      const user=await currentPlayer(); if(!user)return Response.json({error:"Log ind igen."},{status:401});
      if(action==="set_signup_status"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan ændre tilmeldingsstatus."},{status:403});
        if(!["active","waitlist","cancelled"].includes(body.status))return Response.json({error:"Vælg en gyldig status."},{status:400});
        const signupId=Number(body.signupId);
        if(!Number.isSafeInteger(signupId)||signupId<1)return Response.json({error:"Medlemmet skal først angive timer og mulige tider."},{status:400});
        const [signup]=await db.select().from(signups).where(eq(signups.id,signupId)).limit(1);
        if(!signup)return Response.json({error:"Tilmeldingen findes ikke."},{status:404});
        if(body.status!=="cancelled" && (signup.requestedHours<1 || JSON.parse(signup.availability).length<signup.requestedHours))return Response.json({error:"Medlemmet skal først angive timer og mulige tider."},{status:400});
        await db.update(signups).set({status:body.status}).where(eq(signups.id,signupId));
        return NextResponse.json(await state());
      }
      if(action==="delete_member"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan slette medlemmer."},{status:403});
        const playerId=Number(body.playerId);
        if(!Number.isSafeInteger(playerId)||playerId<1)return Response.json({error:"Vælg et medlem."},{status:400});
        if(playerId===user.id)return Response.json({error:"Du kan ikke slette din egen konto."},{status:400});
        const [target]=await db.select().from(players).where(eq(players.id,playerId)).limit(1);
        if(!target)return Response.json({error:"Medlemmet findes ikke længere."},{status:404});
        if(body.confirmMemberNo!==target.memberNo)return Response.json({error:"Bekræft medlemsnummeret for det medlem, du vil slette."},{status:400});
        const authorized=sql`EXISTS (SELECT 1 FROM players AS actor WHERE actor.id = ${user.id} AND actor.role = 'admin')`;

        const results = await db.batch([
          db.delete(pinResetTokens).where(and(authorized,eq(pinResetTokens.playerId,playerId))),
          db.delete(sessions).where(and(authorized,eq(sessions.playerId,playerId))),
          db.delete(signups).where(and(authorized,eq(signups.playerId,playerId))),
          db.delete(feedback).where(and(authorized,or(eq(feedback.authorPlayerId,playerId),eq(feedback.subjectPlayerId,playerId)))),
          db.delete(matchRequests).where(and(authorized,or(eq(matchRequests.creatorPlayerId,playerId),sql`EXISTS (SELECT 1 FROM json_each(${matchRequests.invitedMemberNos}) WHERE value = ${target.memberNo})`,sql`EXISTS (SELECT 1 FROM json_each(${matchRequests.acceptedPlayerIds}) WHERE value = ${playerId})`))),
          db.delete(substitutions).where(and(authorized,eq(substitutions.outgoingPlayerId,playerId))),
          db.update(substitutions).set({replacementPlayerId:null,status:'unresolved',updatedAt:new Date().toISOString()}).where(and(authorized,eq(substitutions.replacementPlayerId,playerId))),
          db.delete(players).where(and(authorized,eq(players.id,playerId))).returning({id:players.id}),
          db.update(players).set({spouseNo:null,spouseMode:null}).where(and(authorized,Number.isSafeInteger(Number(target.memberNo)) ? eq(players.spouseNo,Number(target.memberNo)) : sql`0`)),
        ]);
        const deleted = results[7];
        if(!deleted.length)return Response.json({error:"Medlemmet blev ikke slettet. Genindlæs og kontrollér administratoradgangen."},{status:409});
        return NextResponse.json(await state());
      }
      if(action==="update_member"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan rette medlemmer."},{status:403});
        const [target]=await db.select().from(players).where(eq(players.id,Number(body.playerId))).limit(1);
        if(!target)return Response.json({error:"Medlemmet findes ikke."},{status:404});
        let profile;
        try{profile=profileValues({...body,memberNo:target.memberNo});}catch(error){return Response.json({error:error instanceof Error?error.message:"Kontrollér medlemsoplysningerne."},{status:400});}
        const cr=body.christinRanking;
        if(cr!==null&&(typeof cr!=="number"||!Number.isInteger(cr)||cr<1||cr>9))return Response.json({error:"CR skal være et heltal fra 1 til 9 eller ikke vurderet."},{status:400});


        let spouse;
        try { spouse = spouseSettings(body, target, target.memberNo, await db.select({memberNo:players.memberNo}).from(players)); }
        catch(error) { return Response.json({error:error instanceof Error ? error.message : 'Ugyldig partner.'},{status:400}); }
        await db.update(players).set({...profile,...spouse,christinRanking:cr,...(cr !== target.christinRanking ? {crReviewedAt:null} : {})}).where(eq(players.id,target.id));
        return NextResponse.json(await state());
      }
      if(action==="update_profile"){
        let profile;
        try { profile=profileValues({...body,memberNo:user.memberNo,gender:body.gender===undefined?user.gender:body.gender}); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Kontrollér profilen."},{status:400}); }
        await db.update(players).set(profile).where(eq(players.id,user.id));
        return NextResponse.json(await state());
      }
      if(action==='set_optimizer_defaults') {
        if(user.role!=='admin')return Response.json({error:'Kun administratorer har adgang.'},{status:403});
        let weights: string;
        try { weights = JSON.stringify(parseAlgorithmWeights(body.weights)); }
        catch(error) { return Response.json({error:error instanceof Error ? error.message : 'Kontrollér faktorerne.'},{status:400}); }
        await db.insert(optimizerDefaults).values({id:1,weights}).onConflictDoUpdate({target:optimizerDefaults.id,set:{weights}});
        return NextResponse.json(await state());
      }
      if(action==='set_registration_defaults') {
        if(user.role!=='admin')return Response.json({error:'Kun administratorer har adgang.'},{status:403});
        let defaults;
        try {defaults=parseRegistrationDefaults(body);} catch(error) {return Response.json({error:error instanceof Error?error.message:'Invalid settings'},{status:400});}
        await db.insert(registrationDefaults).values({id:1,...defaults}).onConflictDoUpdate({target:registrationDefaults.id,set:defaults});
        return NextResponse.json(await state());
      }
      if(action==="add_date"||action==="remove_date"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan ændre datolisten."},{status:403});
        if(action==="add_date"){
          if(!validDate(body.date))return Response.json({error:"Vælg en gyldig dato."},{status:400});
          const [existing]=await db.select().from(events).where(eq(events.date,body.date)).limit(1);
          if(existing&&!existing.archived)return Response.json({error:"Datoen findes allerede på listen."},{status:409});
          await db.insert(events).values(calendarEvent(body.date, await loadRegistrationDefaults())).onConflictDoUpdate({target:events.date,set:{archived:false}});
        }else{
          const [target]=await db.select().from(events).where(eq(events.id,Number(body.eventId))).limit(1);
          if(!target||target.archived)return Response.json({error:"Datoen findes ikke på listen."},{status:404});
          if(target.testActive)return Response.json({error:"Afslut testfasen, før du fjerner testrunden."},{status:409});
          await db.update(events).set({archived:true}).where(eq(events.id,target.id));
        }
        return NextResponse.json(await state());
      }
      if(action==="approve_cr" || action==="set_cr"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan godkende CR."},{status:403});
        const cr=body.christinRanking;
        if((cr===null && action==="approve_cr") || (cr!==null && (typeof cr!=="number" || !Number.isInteger(cr) || cr<1 || cr>9)))return Response.json({error:"Vælg CR fra 1 til 9 for at godkende."},{status:400});
        const playerId=Number(body.playerId);
        if(!Number.isSafeInteger(playerId)||playerId<1)return Response.json({error:"Medlemmet findes ikke."},{status:404});
        const changed=await db.update(players).set({christinRanking:cr,crReviewedAt:action==="approve_cr"?new Date().toISOString():null}).where(eq(players.id,playerId)).returning({id:players.id});
        if(!changed.length)return Response.json({error:"Medlemmet findes ikke."},{status:404});
        return NextResponse.json(await state());
      }
      const event=await ensureEvent();
      if(!event)return Response.json({error:"Der er ingen kommende spilledage. En administrator skal tilføje en dato."},{status:409});
      if(action==="export_signups"){
        if(user.role !== "admin") return Response.json({error:"Kun administratorer kan eksportere tilmeldinger."},{status:403});
        const rows = await db.select({
          memberNo: players.memberNo,
          firstName: players.firstName,
          lastName: players.lastName,
          email: players.email,
          gender: players.gender,
          christinRanking: players.christinRanking,
          availability: signups.availability,
          requestedHours: signups.requestedHours,
        }).from(signups).innerJoin(players, eq(players.id, signups.playerId)).where(and(eq(signups.eventId, event.id), eq(signups.status, "active"))).orderBy(asc(players.name));

        const exportRows = buildSignupExportRows(rows.map((row) => ({
          memberNo: String(row.memberNo),
          firstName: String(row.firstName ?? ""),
          lastName: String(row.lastName ?? ""),
          gender: row.gender ?? null,
          christinRanking: row.christinRanking ?? null,
          availability: (() => {
            try { return JSON.parse(row.availability ?? "[]") as string[]; } catch { return []; }
          })(),
          requestedHours: Number(row.requestedHours ?? 0),
        })));

        const XLSX = await import("xlsx");
        const sheet = XLSX.utils.aoa_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Tilmeldinger");
        const mailRows = rows.map((row) => [
          [row.firstName, row.lastName].filter(Boolean).join(" ").trim(),
          row.email ?? "",
        ]);
        const mailSheet = XLSX.utils.aoa_to_sheet([
          ["Fornavn Efternavn", "E-mail", "Mailliste"],
          ...(mailRows.length ? mailRows : [["", ""]]),
        ]);
        mailSheet.C2 = {
          t: "s",
          // Excel requires the future-function prefix to recognize TEXTJOIN without adding @.
          f: '_xlfn.TEXTJOIN(",",TRUE,B2:B1000)',
          v: mailRows.slice(0, 999).map((row) => row[1]).filter(Boolean).join(","),
        };
        mailSheet["!cols"] = [{ wch: 32 }, { wch: 40 }, { wch: 60 }];
        XLSX.utils.book_append_sheet(workbook, mailSheet, "Mailliste");
        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

        return new Response(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="AabenBane.xlsx"',
          },
        });
      }
      if(action==="remove_kampplan"){
        if(body.eventId !== undefined && Number(body.eventId) !== event.id)return Response.json({error:"Spillerunden er ændret. Genindlæs siden."},{status:409});
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan fjerne kampplanen."},{status:403});
        await db.batch([
          db.delete(feedback).where(sql`${feedback.matchId} IN (SELECT id FROM matches WHERE event_id = ${event.id})`),
          db.delete(substitutions).where(eq(substitutions.eventId,event.id)),
          db.delete(matches).where(eq(matches.eventId,event.id)),
          db.update(events).set({importedKampplan:"",status:"draft",publishedAt:null}).where(eq(events.id,event.id)),
        ]);
        return NextResponse.json(await state());
      }
      if(action==="import_kampplan"){
        if(user.role !== "admin") return Response.json({error:"Kun administratorer kan importere kampplanen."},{status:403});
        const schedule = Array.isArray(body.schedule) ? body.schedule : [];
        if(!schedule.length) return Response.json({error:"Der blev ikke fundet nogen kampe i Excel-arket."},{status:400});
        const cleaned = normalizeKampplanRows(schedule);
        if(!cleaned.length) return Response.json({error:"Kampplan-arket er tomt eller ikke læseligt."},{status:400});
        await db.batch([
          db.delete(feedback).where(sql`${feedback.matchId} IN (SELECT id FROM matches WHERE event_id = ${event.id})`),
          db.delete(substitutions).where(eq(substitutions.eventId,event.id)),
          db.delete(matches).where(eq(matches.eventId,event.id)),
          db.update(events).set({importedKampplan:JSON.stringify(cleaned),status:"draft",publishedAt:null}).where(eq(events.id,event.id)),
        ]);
        return NextResponse.json(await state());
      }
      if(action === "set_registration_schedule") {
        if(user.role !== "admin") return Response.json({error:"Kun administratorer kan ændre tidsplanen."},{status:403});
        if(Number(body.eventId) !== event.id) return Response.json({error:"Spillerunden er ændret. Genindlæs siden."},{status:409});
        let schedule;
        try { schedule = registrationSchedule(body); } catch(error) { return Response.json({error:error instanceof Error ? error.message : "Kontrollér tidsplanen."},{status:400}); }
        await db.update(events).set(schedule).where(eq(events.id,event.id));
        return NextResponse.json(await state());
      }
      const registrationOpen=registrationIsOpen(event);
      if(["signup","cancel_signup","request_match","accept_match_request","lookup_member"].includes(action)&&!registrationOpen)return Response.json({error:event.registrationOverride==="closed"?"Tilmeldingen er lukket af administratoren.":`Tilmeldingen er lukket. Tidsplan: ${new Date(event.registrationOpensAt).toLocaleDateString('da-DK',{timeZone:'Europe/Copenhagen'}) + ' kl. ' + new Date(event.registrationOpensAt).toLocaleTimeString('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})} til ${new Date(event.registrationClosesAt).toLocaleDateString('da-DK',{timeZone:'Europe/Copenhagen'}) + ' kl. ' + new Date(event.registrationClosesAt).toLocaleTimeString('en-GB',{timeZone:'Europe/Copenhagen',hour:'2-digit',minute:'2-digit',hourCycle:'h23'})}.`},{status:400});
      if(action === 'join_waitlist') {
        if (Number(body.eventId) !== event.id) return Response.json({error:'Spillerunden er ændret. Genindlæs siden.'},{status:409});
        if (!waitlistIsOpen(event, await eventFirstMatchAt(event))) return Response.json({error:'Ventelisten er kun åben efter tilmeldingsfristen, når tilmeldingen er lukket, og før første kamp.'},{status:400});
        let input;
        try { input = signupInput(body,TIMES); if (input.nHours < 1) throw new Error('Vælg mindst 1 time.'); }
        catch(error) { return Response.json({error:error instanceof Error ? error.message : 'Kontrollér dine ønsker.'},{status:400}); }
        await db.insert(signups).values({eventId:event.id,playerId:user.id,availability:JSON.stringify(input.szPossible),requestedHours:input.nHours,status:'waitlist'})
          .onConflictDoUpdate({target:[signups.eventId,signups.playerId],set:{availability:JSON.stringify(input.szPossible),requestedHours:input.nHours,status:'waitlist'}});
        return NextResponse.json(await state());
      }
      if(action==="lookup_member"){
        const memberNo=String(body.memberNo??"").trim();
        if(!memberNo)return Response.json({found:false,error:"Indtast et medlemsnummer."},{status:400});
        if(memberNo===user.memberNo)return Response.json({found:false,error:"Du skal ikke invitere dig selv."},{status:400});
        const [member]=await db.select({name:players.name}).from(players).where(eq(players.memberNo,memberNo)).limit(1);
        return Response.json(member?{found:true,name:member.name}:{found:false,error:"Medlemsnummeret findes ikke i appen endnu. Spilleren skal først oprette en profil."});
      }else if(action==="signup"){
        let input;
        try {input=signupInput(body,TIMES);} catch(error) {return Response.json({error:error instanceof Error?error.message:"Kontrollér dine tidsønsker."},{status:400});}
        const availability=input.szPossible,requestedHours=input.nHours;
        await db.insert(signups).values({eventId:event.id,playerId:user.id,availability:JSON.stringify(availability),requestedHours,status:"active"}).onConflictDoUpdate({target:[signups.eventId,signups.playerId],set:{availability:JSON.stringify(availability),requestedHours,status:"active"}});
      }else if(action==="cancel_signup")await db.insert(signups).values({eventId:event.id,playerId:user.id,status:"cancelled",requestedHours:0,availability:'[]'}).onConflictDoUpdate({target:[signups.eventId,signups.playerId],set:{status:"cancelled",requestedHours:0,availability:'[]'}});
      else if(action==="request_match"){
        const invited=Array.from(new Set((body.memberNos??[]).map((x:unknown)=>String(x).trim()).filter(Boolean))) as string[]; if(invited.length!==3||invited.includes(user.memberNo))return Response.json({error:"Angiv tre forskellige medlemsnumre."},{status:400});
        for(const memberNo of invited){
          const [member]=await db.select({id:players.id}).from(players).where(eq(players.memberNo,memberNo)).limit(1);
          if(!member)return Response.json({error:`Medlemsnummer ${memberNo} findes ikke i appen endnu. Spilleren skal først oprette en profil.`},{status:400});
        }
        await db.insert(matchRequests).values({eventId:event.id,creatorPlayerId:user.id,invitedMemberNos:JSON.stringify(invited),acceptedPlayerIds:JSON.stringify([user.id])});
      }else if(action==="accept_match_request"){
        const [req]=await db.select().from(matchRequests).where(and(eq(matchRequests.id,Number(body.id)),eq(matchRequests.eventId,event.id))).limit(1); if(!req||!JSON.parse(req.invitedMemberNos).includes(user.memberNo))return Response.json({error:"Invitationen findes ikke."},{status:404});
        const accepted=Array.from(new Set([...JSON.parse(req.acceptedPlayerIds),user.id])); await db.update(matchRequests).set({acceptedPlayerIds:JSON.stringify(accepted),status:accepted.length===4?"ready":"pending",completedAt:accepted.length===4?new Date().toISOString():null}).where(eq(matchRequests.id,req.id));
      }else if(action==="feedback"){
        await db.insert(feedback).values({matchId:Number(body.matchId),authorPlayerId:user.id,balance:body.balance,subjectPlayerId:body.subjectPlayerId?Number(body.subjectPlayerId):null,direction:body.direction??null,comment:String(body.comment??"").slice(0,500)}).onConflictDoUpdate({target:[feedback.matchId,feedback.authorPlayerId],set:{balance:body.balance,subjectPlayerId:body.subjectPlayerId?Number(body.subjectPlayerId):null,direction:body.direction??null,comment:String(body.comment??"").slice(0,500)}});
      }else if(action==="begin_substitute"){
        if(event.status!=="published")return Response.json({error:"Afløserfunktionen åbner, når kampplanen er offentliggjort."},{status:400});
        const [match]=await db.select().from(matches).where(and(eq(matches.id,Number(body.matchId)),eq(matches.eventId,event.id))).limit(1);
        if(!match||!JSON.parse(match.playerIds).includes(user.id))return Response.json({error:"Du står ikke på denne kamp."},{status:403});
        await db.insert(substitutions).values({eventId:event.id,matchId:match.id,outgoingPlayerId:user.id,status:"searching",updatedAt:new Date().toISOString()}).onConflictDoUpdate({target:[substitutions.matchId,substitutions.outgoingPlayerId],set:{replacementPlayerId:null,status:"searching",updatedAt:new Date().toISOString()}});
      }else if(action==="mark_substitute_unresolved"||action==="resume_substitute_search"){
        const [item]=await db.select().from(substitutions).where(and(eq(substitutions.matchId,Number(body.matchId)),eq(substitutions.outgoingPlayerId,user.id),eq(substitutions.eventId,event.id))).limit(1);
        if(!item)return Response.json({error:"Afløsersøgningen findes ikke."},{status:404});
        await db.update(substitutions).set({status:action==="mark_substitute_unresolved"?"unresolved":"searching",updatedAt:new Date().toISOString()}).where(eq(substitutions.id,item.id));
      }else if(action==="confirm_substitute"){
        const replacementPlayerId=Number(body.replacementPlayerId);
        const [item]=await db.select().from(substitutions).where(and(eq(substitutions.matchId,Number(body.matchId)),eq(substitutions.outgoingPlayerId,user.id),eq(substitutions.eventId,event.id))).limit(1);
        const [match]=await db.select().from(matches).where(and(eq(matches.id,Number(body.matchId)),eq(matches.eventId,event.id))).limit(1);
        if(!item||!match||item.status==="replaced")return Response.json({error:"Afløsersøgningen er ikke aktiv."},{status:400});
        const ids:number[]=JSON.parse(match.playerIds);
        if(!ids.includes(user.id))return Response.json({error:"Du står ikke længere på kampen."},{status:400});
        const [replacement]=await db.select().from(players).where(eq(players.id,replacementPlayerId)).limit(1);
        const [replacementSignup]=await db.select().from(signups).where(and(eq(signups.eventId,event.id),eq(signups.playerId,replacementPlayerId),eq(signups.status,"waitlist"))).limit(1);
        if(!replacement||!replacementSignup||!JSON.parse(replacementSignup.availability).includes(match.startTime))return Response.json({error:"Spilleren er ikke længere en mulig afløser til dette tidspunkt."},{status:400});
        const userLevel=user.adminLevel??user.selfLevel,replacementLevel=replacement.adminLevel??replacement.selfLevel;
        const levelDifference=Math.abs(levelScore(userLevel)-levelScore(replacementLevel));
        if(!Number.isFinite(levelDifference)||levelDifference>1)return Response.json({error:"Afløserens niveau ligger for langt fra dit eller kræver vurdering."},{status:400});
        const minutes=(time:string)=>{const [hours,mins]=time.split(":").map(Number);return hours*60+mins;};
        const occupied=await db.select().from(matches).where(eq(matches.eventId,event.id));
        const hasOverlap=occupied.some((other)=>JSON.parse(other.playerIds).includes(replacementPlayerId)&&minutes(other.startTime)<minutes(match.startTime)+60&&minutes(match.startTime)<minutes(other.startTime)+60);
        if(hasOverlap)return Response.json({error:"Spilleren har allerede en kamp på dette tidspunkt."},{status:400});
        await db.update(matches).set({playerIds:JSON.stringify(ids.map((id)=>id===user.id?replacementPlayerId:id))}).where(eq(matches.id,match.id));
        await db.update(substitutions).set({replacementPlayerId,status:"replaced",updatedAt:new Date().toISOString()}).where(eq(substitutions.id,item.id));
        await db.update(signups).set({status:"active"}).where(eq(signups.id,replacementSignup.id));
      }else{
        if(user.role!=="admin")return Response.json({error:"Kun administratoren kan gøre dette."},{status:403});
        if(action==="set_registration"){
          if(!["auto","open","closed"].includes(body.mode))return Response.json({error:"Vælg åben, lukket eller tidsplan."},{status:400});
          await db.update(events).set({registrationOverride:body.mode}).where(eq(events.id,event.id));
        }
        else if(action==="end_test"){
          if(!event.testActive)return Response.json({error:"Der er ingen aktiv testrunde."},{status:400});
          await db.update(events).set({testActive:false,registrationOverride:"closed"}).where(eq(events.id,event.id));
        }
        else if(action==="generate"){
          return Response.json({error:'Brug “Algoritme foreslå kampe” under Kampplan Admin.'},{status:400});
        }
        else if(action==="send_test_email"){
          const recipient=user.email.trim().toLowerCase();
          if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient))return Response.json({error:"Indtast en gyldig e-mailadresse."},{status:400});
          await sendEmail({
            to:recipient,
            subject:"Test fra Åben Bane Aften",
            text:"Dette er en testmail fra Åben Bane Aften-appen. E-mailfunktionen virker.\n\nDette er ikke en officiel HIK-app, men et hjælpemiddel lavet af administratoren for Åben Bane Aften. Kommentarer kan sendes til aabenbaneaften@hik.dk.",
            html:"<div style=\"font-family:Arial,sans-serif;line-height:1.6;color:#17345c\"><h1 style=\"font-size:22px\">Test fra Åben Bane Aften</h1><p>Dette er en testmail fra Åben Bane Aften-appen.</p><p><strong>E-mailfunktionen virker.</strong></p><hr style=\"border:0;border-top:1px solid #d8e1ec;margin:24px 0\"><p style=\"font-size:13px;color:#5b677a\">Dette er ikke en officiel HIK-app, men et hjælpemiddel lavet af administratoren for Åben Bane Aften. Kommentarer kan sendes til <a href=\"mailto:aabenbaneaften@hik.dk\">aabenbaneaften@hik.dk</a>.</p></div>",
          });
        }
        else if(action==="publish")await db.update(events).set({status:"published",publishedAt:new Date().toISOString()}).where(eq(events.id,event.id));
        else if(action==="set_level")await db.update(players).set({adminLevel:body.level||null}).where(eq(players.id,Number(body.playerId)));
        else if(action==="set_admin"){
          const playerId=Number(body.playerId),makeAdmin=Boolean(body.makeAdmin);
          const [target]=await db.select({id:players.id,role:players.role}).from(players).where(eq(players.id,playerId)).limit(1);
          if(!target)return Response.json({error:"Spilleren findes ikke."},{status:404});
          const [{value:adminCount}]=await db.select({value:count()}).from(players).where(eq(players.role,"admin"));
          if(makeAdmin&&target.role!=="admin"&&adminCount>=4)return Response.json({error:"Der kan højst være fire administratorer i alt."},{status:400});
          if(!makeAdmin&&playerId===user.id)return Response.json({error:"Du kan ikke fjerne din egen administratoradgang."},{status:400});
          if(!makeAdmin&&target.role==="admin"&&adminCount<=1)return Response.json({error:"Den sidste administrator kan ikke fjernes."},{status:400});
          await db.update(players).set({role:makeAdmin?"admin":"player"}).where(eq(players.id,playerId));
        }
        else if(action==="update_match")await db.update(matches).set({court:Number(body.court),startTime:String(body.startTime),playerIds:JSON.stringify(body.playerIds.map(Number)),locked:Boolean(body.locked)}).where(and(eq(matches.id,Number(body.id)),eq(matches.eventId,event.id)));
        else if(action==="mark_absent")await db.update(players).set({suspendedEventId:event.id}).where(eq(players.id,Number(body.playerId)));
      }
    }
    return NextResponse.json(await state());
  }catch(error){const message=error instanceof Error?error.message:"Noget gik galt";return Response.json({error:message.includes("UNIQUE")?"Medlemsnummeret er allerede oprettet. Vælg “Log ind” og brug din personlige kode.":message},{status:500});}
}
