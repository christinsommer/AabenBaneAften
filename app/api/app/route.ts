import { and, asc, count, desc, eq, gt, ne, or, sql } from "drizzle-orm";
import * as XLSX from "xlsx";
import { NextResponse } from "next/server";
import { getDb } from "../../../db";
import { events, feedback, matches, matchRequests, pinResetTokens, players, sessions, signups, substitutions } from "../../../db/schema";
import { createSession, currentPlayer, destroySession, hashPin, hashToken, verifyPin, verifyToken } from "../../../lib/auth";
import { ensureEvent, generateSchedule, TIMES } from "../../../lib/schedule";
import { sendEmail } from "../../../lib/email";
import { sendWelcomeEmail } from "../../../lib/welcome-email";
import { registrationIsOpen } from "../../../lib/registration";
import { profileValues } from "../../../lib/profile";
import { calendarEvent, validDate } from "../../../lib/calendar";
import { signupInput, signupFields, noSignup } from "../../../lib/signup";
import { visibleMember } from "../../../lib/member-visibility";
import { initialCr } from '../../../lib/initial-cr';
import { levelScore } from '../../../lib/ranking';
import { buildSignupExportRows } from "../../../lib/export-signups";
import { normalizeKampplanRows } from "../../../lib/kampplan-import";

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

async function state() {
  const db = getDb(); const event = await ensureEvent(); const user = await currentPlayer();
  const isOpen = event ? registrationIsOpen(event) : false;
  const calendarDates = await db.select({id:events.id,date:events.date,status:events.status,isTest:events.isTest,testActive:events.testActive}).from(events).where(eq(events.archived,false)).orderBy(asc(events.date));
  const importedMatches = event ? parseImportedKampplan(event.importedKampplan) : [];
  if (!user) return { authenticated: false, event, isOpen, times: TIMES, importedMatches };
  if (!event) return {authenticated:true,user:visibleMember(user),event:null,isOpen:false,times:TIMES,calendarDates,importedMatches: []};
  const signup = (await db.select().from(signups).where(and(eq(signups.eventId,event.id),eq(signups.playerId,user.id),ne(signups.status,"cancelled"))).limit(1))[0] ?? null;
  const eventMatches = await db.select().from(matches).where(eq(matches.eventId,event.id)).orderBy(asc(matches.startTime),asc(matches.court));
  const allPlayers = user.role === "admin" ? await db.select({id:players.id,memberNo:players.memberNo,name:players.name,firstName:players.firstName,lastName:players.lastName,email:players.email,phone:players.phone,phoneCountryCode:players.phoneCountryCode,christinRanking:players.christinRanking,gender:players.gender,selfLevel:players.selfLevel,adminLevel:players.adminLevel,role:players.role,suspendedEventId:players.suspendedEventId}).from(players).orderBy(asc(players.name)) : [];
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
    email:players.email,
    level:players.selfLevel,
    availability:signups.availability,
  }).from(signups).innerJoin(players,eq(players.id,signups.playerId)).where(and(eq(signups.eventId,event.id),eq(signups.status,"waitlist"))).orderBy(asc(signups.createdAt));
  const names = await db.select({id:players.id,name:players.name}).from(players);
  const substitutionRows = await db.select().from(substitutions).where(eq(substitutions.eventId,event.id)).orderBy(desc(substitutions.updatedAt));
  const substitutionsForUser = substitutionRows.filter((item)=>user.role==="admin"||item.outgoingPlayerId===user.id).map((item)=>({
    ...item,
    outgoingName:names.find((player)=>player.id===item.outgoingPlayerId)?.name??"Ukendt spiller",
    replacementName:item.replacementPlayerId?names.find((player)=>player.id===item.replacementPlayerId)?.name??"Ukendt spiller":null,
  }));
  const requestRows = await db.select({request:matchRequests,creatorName:players.name}).from(matchRequests).innerJoin(players,eq(players.id,matchRequests.creatorPlayerId)).where(eq(matchRequests.eventId,event.id));
  const requests = requestRows.filter(({request})=>request.creatorPlayerId===user.id||JSON.parse(request.invitedMemberNos).includes(user.memberNo)).map(({request,creatorName})=>({id:request.id,creatorName,status:request.status,isCreator:request.creatorPlayerId===user.id,isInvited:JSON.parse(request.invitedMemberNos).includes(user.memberNo),accepted:JSON.parse(request.acceptedPlayerIds).includes(user.id),acceptedCount:JSON.parse(request.acceptedPlayerIds).length}));
  return { authenticated:true,user:visibleMember(user),event,isOpen,times:TIMES,calendarDates,importedMatches,signup:signup?{...signup,...signupFields(signup)}:noSignup(event.id,user.id),matches:event.status==="published"?eventMatches:[],adminMatches:user.role==="admin"?eventMatches:[],players:allPlayers,signups:memberSignups,signupHistory:signupHistory.map(row=>({...row,signup:{...row.signup,...signupFields(row.signup)}})),waitlist,names,requests,substitutions:substitutionsForUser };
}

export async function GET(){try{return Response.json(await state());}catch(error){return Response.json({error:error instanceof Error?error.message:"Appen kunne ikke indlæses"},{status:500});}}

export async function POST(request:Request){
  try{
    const db=getDb(); const body=await request.json() as Record<string,any>; const action=String(body.action??"");
    if(action==="request_pin_reset"){
      const memberNo=String(body.memberNo??"").trim();
      if(!memberNo)return Response.json({error:"Indtast et medlemsnummer."},{status:400});
      const [player]=await db.select({id:players.id,email:players.email}).from(players).where(eq(players.memberNo,memberNo)).limit(1);
      if(!player)return Response.json({error:"Medlemsnummeret findes ikke i appen."},{status:404});
      const token=crypto.randomUUID();
      const expiresAt=new Date(Date.now()+60*60*1000).toISOString();
      await db.insert(pinResetTokens).values({playerId:player.id,tokenHash:await hashToken(token),expiresAt});
      try {
        await sendEmail(resetLinkEmail(player.email, token));
      } catch {
        return Response.json({ ok: true, warning: "Der blev oprettet et reset-link, men e-mailen kunne ikke sendes i dette miljø." });
      }
      return Response.json({ok:true});
    }
    if(action==="reset_pin"){
      const token=String(body.token??"").trim();
      const pin=String(body.pin??"");
      const confirmPin=String(body.confirmPin??"");
      if(!token)return Response.json({error:"Reset-linket mangler."},{status:400});
      if(!/^\d{4,8}$/.test(pin))return Response.json({error:"Indtast en gyldig pinkode på 4–8 cifre."},{status:400});
      if(pin!==confirmPin)return Response.json({error:"De to pinkoder stemmer ikke overens."},{status:400});
      const [tokenRow]=await db.select({playerId:pinResetTokens.playerId}).from(pinResetTokens).where(and(eq(pinResetTokens.tokenHash, await hashToken(token)), gt(pinResetTokens.expiresAt, new Date().toISOString()))).limit(1);
      if(!tokenRow)return Response.json({error:"Reset-linket er ugyldigt eller udløbet."},{status:400});
      await db.update(players).set({pinHash:await hashPin(pin)}).where(eq(players.id,tokenRow.playerId));
      await db.delete(pinResetTokens).where(eq(pinResetTokens.playerId,tokenRow.playerId));
      return Response.json({ok:true});
    }
    if(action==="register"){
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


        await db.update(players).set({...profile,christinRanking:cr}).where(eq(players.id,target.id));
        return NextResponse.json(await state());
      }
      if(action==="update_profile"){
        let profile;
        try { profile=profileValues({...body,memberNo:user.memberNo,gender:body.gender===undefined?user.gender:body.gender}); } catch(error) { return Response.json({error:error instanceof Error?error.message:"Kontrollér profilen."},{status:400}); }
        await db.update(players).set(profile).where(eq(players.id,user.id));
        return NextResponse.json(await state());
      }
      if(action==="add_date"||action==="remove_date"){
        if(user.role!=="admin")return Response.json({error:"Kun administratorer kan ændre datolisten."},{status:403});
        if(action==="add_date"){
          if(!validDate(body.date))return Response.json({error:"Vælg en gyldig dato."},{status:400});
          const [existing]=await db.select().from(events).where(eq(events.date,body.date)).limit(1);
          if(existing&&!existing.archived)return Response.json({error:"Datoen findes allerede på listen."},{status:409});
          await db.insert(events).values(calendarEvent(body.date)).onConflictDoUpdate({target:events.date,set:{archived:false}});
        }else{
          const [target]=await db.select().from(events).where(eq(events.id,Number(body.eventId))).limit(1);
          if(!target||target.archived)return Response.json({error:"Datoen findes ikke på listen."},{status:404});
          if(target.testActive)return Response.json({error:"Afslut testfasen, før du fjerner testrunden."},{status:409});
          await db.update(events).set({archived:true}).where(eq(events.id,target.id));
        }
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

        const sheet = XLSX.utils.aoa_to_sheet(exportRows);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, sheet, "Tilmeldinger");
        const buffer = XLSX.write(workbook, { bookType: "xlsx", type: "buffer" });

        return new Response(buffer, {
          headers: {
            "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            "Content-Disposition": 'attachment; filename="Aabenbane.xlsx"',
          },
        });
      }
      if(action==="remove_kampplan"){
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
        await db.update(events).set({ importedKampplan: JSON.stringify(cleaned) }).where(eq(events.id, event.id));
        return NextResponse.json(await state());
      }
      const registrationOpen=registrationIsOpen(event);
      if(["signup","cancel_signup","request_match","accept_match_request","lookup_member"].includes(action)&&!registrationOpen)return Response.json({error:event.registrationOverride==="closed"?"Tilmeldingen er lukket af administratoren.":"Tilmeldingen er lukket. Den normale åbningstid er onsdag kl. 12 til torsdag kl. 12."},{status:400});
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
      }else if(action==="cancel_signup")await db.update(signups).set({status:"cancelled"}).where(and(eq(signups.eventId,event.id),eq(signups.playerId,user.id)));
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
        else if(action==="set_cr"){
          const cr=body.christinRanking;
          if(cr!==null&&(typeof cr!=="number"||!Number.isInteger(cr)||cr<1||cr>9))return Response.json({error:"CR skal være et heltal fra 1 til 9 eller ikke vurderet."},{status:400});
          const playerId=Number(body.playerId);
          const [target]=await db.select({id:players.id}).from(players).where(eq(players.id,playerId)).limit(1);
          if(!target)return Response.json({error:"Spilleren findes ikke."},{status:404});
          await db.update(players).set({christinRanking:cr}).where(eq(players.id,playerId));
        }
        else if(action==="generate"){
          await db.update(events).set({status:"draft",publishedAt:null}).where(eq(events.id,event.id));
          await generateSchedule(event.id);
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



