/* eslint-disable @typescript-eslint/no-explicit-any */
import { getCloudflareContext } from '@opennextjs/cloudflare';
import { sha256 } from './credentials';
import { PRIVACY_VERSION, CONSENT_VERSION, CONSENT_TEXT, CONSENT_HELP, privacySections, cookieSections } from './privacy-text';

const stamp = () => new Date().toISOString();
const uuid = () => crypto.randomUUID();
export const privacyDb = () => getCloudflareContext().env.DB;
const statement = (q:string,...v:any[]) => privacyDb().prepare(q).bind(...v);
const one = (q:string,...v:any[]):Promise<any> => statement(q,...v).first();
const all = async(q:string,...v:any[]):Promise<any[]> => (await statement(q,...v).all()).results;
const guard = (q:string,...v:any[]) => statement(`SELECT CASE WHEN (${q}) THEN 1 ELSE json('Access or state changed') END`,...v);
const active = `EXISTS(SELECT 1 FROM profile_privacy WHERE player_id=? AND closed_at IS NULL)`;
const admin = `EXISTS(SELECT 1 FROM players p JOIN profile_privacy a ON a.player_id=p.id WHERE p.id=? AND p.role='admin' AND a.closed_at IS NULL)`;
const eligibleSql = `SELECT p.id,p.name,p.email,n.consent_id,n.email_revision FROM players p JOIN profile_privacy a ON a.player_id=p.id JOIN newsletter_preferences n ON n.player_id=p.id JOIN newsletter_events e ON e.id=n.consent_id AND e.player_id=p.id WHERE a.closed_at IS NULL AND (n.status='subscribed' OR (n.status='paused' AND n.paused_until<=?)) AND e.action='subscribe' AND e.email=p.email AND e.version IS NOT NULL AND e.checkbox_text IS NOT NULL AND e.help_text IS NOT NULL`;
const validEmail = (email:string) => email.length<=254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
export async function ensureDocuments() {
  const documents:[string,string,unknown][]=[['privacy',PRIVACY_VERSION,privacySections],['cookies',PRIVACY_VERSION,cookieSections],['newsletter',CONSENT_VERSION,[CONSENT_TEXT,CONSENT_HELP]]];
  for(const [type,version,sections] of documents) {
    const content=JSON.stringify(sections),hash=await sha256(content);
    await statement('INSERT OR IGNORE INTO privacy_documents VALUES(?,?,?,?,?)',type,version,content,hash,stamp()).run();
    const old=await one('SELECT content_hash FROM privacy_documents WHERE document_type=? AND version=?',type,version);
    if(old.content_hash!==hash)throw Error('Ændret information kræver en ny dokumentversion.');
  }
}
export async function activity(id:number,type:string) {
  await statement("UPDATE profile_privacy SET last_active_at=?,activity_known=1,activity_type=? WHERE player_id=? AND closed_at IS NULL",stamp(),type,id).run();
}
export async function closed(id:number){return !!(await one('SELECT closed_at FROM profile_privacy WHERE player_id=?',id))?.closed_at;}
function ackStatements(id:number|string,source:string,byMember=false) {
  return ['privacy','cookies'].map(type=>statement(`INSERT OR IGNORE INTO privacy_acknowledgements SELECT ${byMember?'id':'?'},?,?,?,? ${byMember?'FROM players WHERE member_no=?':''}`, ...byMember?[type,PRIVACY_VERSION,stamp(),source,id]:[id,type,PRIVACY_VERSION,stamp(),source]));
}
export async function registerWithPrivacy(query:{sql:string;params:unknown[]},memberNo:string,consent:boolean) {
  if(/^closed-/i.test(memberNo))throw Error('Dette medlemsnummer er reserveret til lukkede profiler.');
  await ensureDocuments();
  const now=stamp(),eventId=uuid();
  const batch=[statement(query.sql,...query.params),...ackStatements(memberNo,'registration',true)];
  if(consent)batch.push(
    statement("INSERT INTO newsletter_events SELECT ?,id,email,'subscribe',?,'registration',?,?,? FROM players WHERE member_no=?",eventId,now,CONSENT_VERSION,CONSENT_TEXT,CONSENT_HELP,memberNo),
    statement("INSERT INTO newsletter_preferences SELECT id,'subscribed',NULL,?,?,? FROM players WHERE member_no=?",uuid(),eventId,now,memberNo));
  await privacyDb().batch(batch);
}
export async function acknowledge(id:number) {
  await ensureDocuments();
  await privacyDb().batch([guard(active,id),...ackStatements(id,'profile')]);
}
export async function preference(id:number) {
  const row=await one('SELECT n.*,p.email,e.email AS consent_email,e.checkbox_text,e.help_text,e.version,a.closed_at FROM players p JOIN profile_privacy a ON a.player_id=p.id LEFT JOIN newsletter_preferences n ON n.player_id=p.id LEFT JOIN newsletter_events e ON e.id=n.consent_id AND e.player_id=p.id AND e.action=\'subscribe\' WHERE p.id=?',id);
  return preferenceValue(row);
}
function preferenceValue(row:any) {
  if(!row||row.closed_at)throw Error('Profilen er lukket eller findes ikke.');
  const valid=!!(row.consent_id&&row.email===row.consent_email&&row.checkbox_text&&row.help_text&&row.version&&validEmail(row.email));
  const status=row.status==='unsubscribed'?'unsubscribed':valid?(row.status==='paused'&&row.paused_until>stamp()?'paused':'subscribed'):'never';
  return {status,pausedUntil:status==='paused'?row.paused_until:null,needsConsent:!valid,changedAt:row.changed_at??null};
}
export async function memberData(id:number){await ensureDocuments();return {version:PRIVACY_VERSION,needsAcknowledgement:(await one('SELECT count(*) n FROM privacy_acknowledgements WHERE player_id=? AND version=? AND document_type IN (\'privacy\',\'cookies\')',id,PRIVACY_VERSION)).n!==2,newsletter:await preference(id)};}
export async function setPreference(id:number,choice:string,consent:boolean,source='profile',tokenHash?:string) {
  if(!['subscribe','unsubscribe','pause','resume'].includes(choice))throw Error('Ukendt nyhedsbrevsvalg.');
  if(choice==='subscribe'&&!consent)throw Error('Vælg samtykke til nyhedsmails.');
  if(choice==='subscribe')await ensureDocuments();
  const current=await preference(id),now=stamp(),eventId=uuid();
  if(['pause','resume'].includes(choice)&&current.needsConsent)throw Error('Tilmeld dig først med nyt samtykke.');
  const batch=[guard(active,id)];
  if(tokenHash)batch.push(tokenGuard(tokenHash,id));
  if(['pause','resume'].includes(choice))batch.push(guard("EXISTS(SELECT 1 FROM newsletter_preferences n JOIN newsletter_events e ON e.id=n.consent_id JOIN players p ON p.id=n.player_id WHERE p.id=? AND n.status IN ('subscribed','paused') AND e.email=p.email AND e.action='subscribe')",id));
  batch.push(statement('INSERT INTO newsletter_events SELECT ?,id,email,?,?,?, ?,?,? FROM players WHERE id=?',eventId,choice,now,source,choice==='subscribe'?CONSENT_VERSION:null,choice==='subscribe'?CONSENT_TEXT:null,choice==='subscribe'?CONSENT_HELP:null,id));
  if(choice==='subscribe')batch.push(statement("INSERT INTO newsletter_preferences VALUES(?,'subscribed',NULL,?,?,?) ON CONFLICT(player_id) DO UPDATE SET status='subscribed',paused_until=NULL,email_revision=excluded.email_revision,consent_id=excluded.consent_id,changed_at=excluded.changed_at",id,uuid(),eventId,now),statement('UPDATE newsletter_tokens SET revoked_at=? WHERE player_id=?',now,id));
  else if(choice==='unsubscribe')batch.push(statement("INSERT INTO newsletter_preferences VALUES(?,'unsubscribed',NULL,?,NULL,?) ON CONFLICT(player_id) DO UPDATE SET status='unsubscribed',paused_until=NULL,changed_at=excluded.changed_at",id,uuid(),now));
  else batch.push(statement('UPDATE newsletter_preferences SET status=?,paused_until=?,changed_at=? WHERE player_id=?',choice==='pause'?'paused':'subscribed',choice==='pause'?new Date(Date.now()+30*86400000).toISOString():null,now,id));
  batch.push(statement("UPDATE profile_privacy SET last_active_at=?,activity_known=1,activity_type='newsletter' WHERE player_id=?",now,id));
  await privacyDb().batch(batch);
  return preference(id);
}
function tokenGuard(hash:string,id:number){return guard('EXISTS(SELECT 1 FROM newsletter_tokens t JOIN newsletter_preferences n ON n.player_id=t.player_id JOIN profile_privacy a ON a.player_id=t.player_id WHERE t.token_hash=? AND t.player_id=? AND t.revoked_at IS NULL AND t.email_revision=n.email_revision AND t.consent_id=n.consent_id AND a.closed_at IS NULL)',hash,id);}
export async function tokenAction(token:string,choice:string){
  if(!/^[a-f0-9]{64}$/.test(token)||!['unsubscribe','pause'].includes(choice))throw Error('Linket er ugyldigt.');
  const hash=await sha256(token),row=await one('SELECT player_id FROM newsletter_tokens WHERE token_hash=? AND revoked_at IS NULL',hash);
  if(!row)throw Error('Linket er udløbet eller tilbagekaldt.');
  return setPreference(row.player_id,choice,false,'personal-link',hash);
}
export async function eligible(){return (await all(eligibleSql,stamp())).filter(p=>validEmail(p.email));}
async function reviewProfiles(id?:number) {
  const rows=await all(`SELECT p.id,p.name,p.email,p.phone,p.phone_country_code,p.role,p.member_no,a.*,
    (SELECT count(*) FROM signups WHERE player_id=p.id) AS signup_count,
    (SELECT count(*) FROM signups s JOIN events e ON e.id=s.event_id WHERE s.player_id=p.id AND s.status<>'cancelled' AND e.status<>'cancelled' AND e.date>=?) AS future_count,
    (SELECT count(*) FROM matches WHERE EXISTS(SELECT 1 FROM json_each(player_ids) WHERE value=p.id)) AS match_count,
    (SELECT count(*) FROM match_requests WHERE creator_player_id=p.id OR EXISTS(SELECT 1 FROM json_each(invited_member_nos) WHERE CAST(value AS TEXT)=p.member_no) OR EXISTS(SELECT 1 FROM json_each(accepted_player_ids) WHERE value=p.id)) AS request_count,
    (SELECT count(*) FROM feedback WHERE author_player_id=p.id OR subject_player_id=p.id) AS feedback_count,
    (SELECT count(*) FROM substitutions WHERE outgoing_player_id=p.id OR replacement_player_id=p.id) AS substitution_count,
    (SELECT count(*) FROM events WHERE imported_kampplan<>'' AND imported_kampplan<>'[]') AS imported_count,
    (SELECT count(*) FROM newsletter_recipients WHERE player_id=p.id AND status='sending') AS inflight_count,
    (SELECT count(*) FROM (SELECT subject,body FROM newsletter_drafts UNION ALL SELECT subject,body FROM newsletter_dispatches) WHERE instr(lower(subject||body),lower(p.name))>0 OR (p.email<>'' AND instr(lower(subject||body),lower(p.email))>0)) AS newsletter_count
    FROM players p JOIN profile_privacy a ON a.player_id=p.id`+(id===undefined?'':' WHERE p.id=?'),stamp().slice(0,10),...id===undefined?[]:[id]);
  const reviewEvents=await all('SELECT player_id,action,method,note,occurred_at,actor_id FROM privacy_review_events'+(id===undefined?'':' WHERE player_id=?')+' ORDER BY occurred_at DESC',...id===undefined?[]:[id]);
  const threshold=new Date();threshold.setUTCMonth(threshold.getUTCMonth()-24);
  return rows.map(p=>{
    const relations={signups:p.signup_count,future:p.future_count,matches:p.match_count,requests:p.request_count,feedback:p.feedback_count,substitutions:p.substitution_count,importedPlans:p.imported_count,newsletterText:p.newsletter_count,inflightMail:p.inflight_count};
    const blockers=[];
    if(p.role==='admin')blockers.push('Administratorkonto');
    if(relations.future)blockers.push('Kommende tilmeldinger');
    if(relations.newsletterText)blockers.push('Navn eller e-mail forekommer i nyhedsbrevstekst; kladder og arkiv kræver særskilt gennemgang');
    if(relations.inflightMail)blockers.push('En mailafsendelse er i gang eller afbrudt og skal først afklares');
    const unknown=!p.activity_known,inactive=!unknown&&new Date(p.last_active_at)<=threshold;
    return {...p,relations,blockers,unknown,inactive,due:!p.closed_at&&(unknown||inactive)&&(!p.review_after||p.review_after<=stamp().slice(0,10)),events:reviewEvents.filter(e=>e.player_id===p.id)};
  });
}
export async function reviewInfo(id:number) {const [p]=await reviewProfiles(id);if(!p)throw Error('Profilen findes ikke.');return p;}
export async function review(actor:number,input:any) {
  const id=Number(input.playerId),p=await reviewInfo(id),now=stamp();
  const action=String(input.choice),note=String(input.note??'').trim();
  if(p.closed_at)throw Error('Profilen er allerede lukket.');
  if(note.length>1000)throw Error('Noten må højst være 1000 tegn.');
  if(!['contact','keep','pendingErasure','erase'].includes(action))throw Error('Ukendt vurdering.');
  if(action==='keep'&&(!note||!/^\d{4}-\d{2}-\d{2}$/.test(input.reviewAfter)||input.reviewAfter<=now.slice(0,10)))throw Error('Angiv begrundelse og en fremtidig revurderingsdato.');
  if(action==='contact'&&!['email','sms','phone'].includes(input.method))throw Error('Vælg kontaktmetode.');
  const batch=[guard(admin,actor),guard(active,id)];
  if(action==='erase') {
    if(input.confirm!==true||p.blockers.length)throw Error('Bekræft handlingen og afklar alle spærringer først.');
    // Recheck all blockers in the same atomic batch as closure.
    batch.push(guard("EXISTS(SELECT 1 FROM players WHERE id=? AND role<>'admin' AND name=? AND member_no=?) AND NOT EXISTS(SELECT 1 FROM signups s JOIN events e ON e.id=s.event_id WHERE s.player_id=? AND s.status<>'cancelled' AND e.status<>'cancelled' AND e.date>=?)",id,p.name,p.member_no,id,now.slice(0,10)));
    const replacement='NN '+id,closedMemberNo='closed-'+id;
    const plans=await all("SELECT id,imported_kampplan FROM events WHERE imported_kampplan<>'' AND imported_kampplan<>'[]'");
    batch.push(guard("(SELECT count(*) FROM events WHERE imported_kampplan<>'' AND imported_kampplan<>'[]')=?",plans.length));
    const scrub=(value:any):any=>{
      if(typeof value==='string')return value.toLocaleLowerCase('da-DK')===String(p.name).toLocaleLowerCase('da-DK')?replacement:value;
      if(Array.isArray(value))return value.map(scrub);
      if(value&&typeof value==='object')return Object.fromEntries(Object.entries(value).map(([key,v])=>[key,scrub(v)]));
      return value;
    };
    for(const plan of plans){
      let content;try{content=JSON.parse(plan.imported_kampplan);}catch{throw Error('En importeret kampplan kan ikke læses. Ret planen før profilen lukkes.');}
      const cleaned=JSON.stringify(scrub(content));
      batch.push(guard('EXISTS(SELECT 1 FROM events WHERE id=? AND imported_kampplan=?)',plan.id,plan.imported_kampplan));
      if(cleaned!==JSON.stringify(content)){
        if(await one('SELECT id FROM players WHERE id<>? AND lower(name)=lower(?)',id,p.name))throw Error('Flere profiler har samme navn i importerede kampplaner. Afklar navnesammenfald før lukning.');
        batch.push(statement('UPDATE events SET imported_kampplan=? WHERE id=?',cleaned,plan.id));
      }
    }
    batch.push(statement("UPDATE feedback SET comment='' WHERE author_player_id=? OR subject_player_id=?",id,id));
    batch.push(guard("NOT EXISTS(SELECT 1 FROM (SELECT subject,body FROM newsletter_drafts UNION ALL SELECT subject,body FROM newsletter_dispatches) WHERE instr(lower(subject||body),lower(?))>0 OR (?<>'' AND instr(lower(subject||body),lower(?))>0))",p.name,p.email,p.email));
    batch.push(guard("NOT EXISTS(SELECT 1 FROM newsletter_recipients WHERE player_id=? AND status='sending')",id));
    batch.push(statement("UPDATE match_requests SET invited_member_nos=(SELECT json_group_array(CASE WHEN CAST(value AS TEXT)=? THEN ? ELSE value END) FROM json_each(match_requests.invited_member_nos)) WHERE EXISTS(SELECT 1 FROM json_each(invited_member_nos) WHERE CAST(value AS TEXT)=?)",p.member_no,closedMemberNo,p.member_no));
    batch.push(statement("UPDATE players SET spouse_no=NULL,spouse_mode=NULL WHERE CAST(spouse_no AS TEXT)=?",p.member_no));
    // CR and its existing review timestamp belong to the retained match history.
    // Closed profiles are excluded from the member/CR administration list below.
    batch.push(statement("UPDATE players SET member_no=?,name=?,first_name='NN',last_name=?,email='',phone='',phone_country_code='',pin_hash='',birth_year=NULL,age=NULL,self_level='Begynder',admin_level=NULL,gender='K',spouse_no=NULL,spouse_mode=NULL,email_visible=0,phone_visible=0,suspended_event_id=NULL WHERE id=?",closedMemberNo,replacement,String(id),id));
    batch.push(statement('DELETE FROM sessions WHERE player_id=?',id),statement('DELETE FROM pin_reset_tokens WHERE player_id=?',id),statement('UPDATE newsletter_tokens SET revoked_at=? WHERE player_id=?',now,id),statement("UPDATE newsletter_preferences SET status='unsubscribed',consent_id=NULL,paused_until=NULL WHERE player_id=?",id),statement('UPDATE newsletter_events SET email=NULL WHERE player_id=?',id),statement('UPDATE newsletter_recipients SET email=NULL WHERE player_id=?',id),statement('UPDATE privacy_review_events SET note=NULL WHERE player_id=?',id),statement('DELETE FROM privacy_acknowledgements WHERE player_id=?',id),statement("UPDATE profile_privacy SET closed_at=?,review_status='closed',last_contact_at=NULL,contact_method=NULL,review_after=NULL WHERE player_id=?",now,id));
  } else if(action==='contact')batch.push(statement("UPDATE profile_privacy SET review_status='contacted',last_contact_at=?,contact_method=? WHERE player_id=?",now,input.method,id));
  else batch.push(statement('UPDATE profile_privacy SET review_status=?,review_after=? WHERE player_id=?',action,action==='keep'?input.reviewAfter:p.review_after,id));
  batch.push(statement('INSERT INTO privacy_review_events VALUES(?,?,?,?,?,?,?)',uuid(),id,action,action==='contact'?input.method:null,action==='erase'?null:note,now,actor));
  await privacyDb().batch(batch);
}
export async function adminData() {
  const profiles=await reviewProfiles();
  const recipients=await all("SELECT p.id,p.name,p.email,n.status,n.paused_until,n.changed_at,n.consent_id,e.email AS consent_email,e.checkbox_text,e.help_text,e.version FROM players p JOIN profile_privacy a ON a.player_id=p.id LEFT JOIN newsletter_preferences n ON n.player_id=p.id LEFT JOIN newsletter_events e ON e.id=n.consent_id AND e.player_id=p.id AND e.action='subscribe' WHERE a.closed_at IS NULL");
  for(const p of recipients)Object.assign(p,preferenceValue(p));
  const dispatches=await all('SELECT * FROM newsletter_dispatches ORDER BY created_at DESC');
  const deliveries=await all('SELECT * FROM newsletter_recipients');
  for(const d of dispatches){d.recipients=deliveries.filter(r=>r.dispatch_id===d.id);const sent=d.recipients.filter((r:any)=>r.status==='sent').length;d.status=sent===d.recipients.length?'sent':sent?'partly-sent':'prepared';}
  return {profiles,recipients,drafts:await all('SELECT * FROM newsletter_drafts ORDER BY updated_at DESC'),dispatches,lastSent:(await one('SELECT max(sent_at) at FROM newsletter_recipients')).at,eligibleCount:(await eligible()).length};
}
export async function draftAction(actor:number,input:any):Promise<any> {
  if(input.action==='proposal') {
    const dates=await all("SELECT date FROM events WHERE date>=? AND archived=0 AND is_test=0 AND status<>'cancelled' ORDER BY date LIMIT 8",stamp().slice(0,10));
    return {subject:'Kommende spilleaftener i Åben Bane',body:`Hej\n\nSe de kommende spilleaftener:\n${dates.map(p=>p.date).join('\n')}\n\nTilmeld dig på https://aabenbaneaften.dk\n\nVenlig hilsen\nÅben Bane Aften`};
  }
  if(input.action==='saveDraft') {
    const subject=String(input.subject??'').trim(),body=String(input.body??'').trim(),id=input.id||uuid();
    if(!subject||subject.length>200||!body||body.length>20000)throw Error('Angiv emne (højst 200 tegn) og tekst (højst 20.000 tegn).');
    await privacyDb().batch([guard(admin,actor),statement('INSERT INTO newsletter_drafts VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET subject=excluded.subject,body=excluded.body,updated_at=excluded.updated_at',id,subject,body,stamp(),stamp(),actor)]);return {id};
  }
  if(input.action==='copy') {
    const d=await one('SELECT subject,body FROM newsletter_dispatches WHERE id=?',input.id);if(!d)throw Error('Udsendelsen findes ikke.');
    return {...d,...await draftAction(actor,{action:'saveDraft',...d})};
  }
  if(input.action==='prepare') {
    const members=await eligible(),draft=await one('SELECT * FROM newsletter_drafts WHERE id=?',input.id);
    if(!draft||!members.length||input.confirm!==true||input.count!==members.length)throw Error('Bekræft det aktuelle modtagerantal.');
    const id=uuid(),recent=new Date(Date.now()-30*86400000).toISOString();
    const batch=[guard(admin,actor)];
    if(input.override!==true)batch.push(guard('NOT EXISTS(SELECT 1 FROM newsletter_recipients WHERE sent_at>?) AND NOT EXISTS(SELECT 1 FROM newsletter_dispatches WHERE created_at>?)',recent,recent));
    batch.push(statement('INSERT INTO newsletter_dispatches VALUES(?,?,?,?,?,?)',id,draft.subject,draft.body,stamp(),actor,input.override===true?1:0));
    const snapshot=JSON.stringify(members.map(p=>({id:p.id,email:p.email,consent:p.consent_id})));
    batch.push(guard(`(SELECT count(*) FROM (${eligibleSql}) p JOIN json_each(?) s ON p.id=json_extract(s.value,'$.id') AND p.email=json_extract(s.value,'$.email') AND p.consent_id=json_extract(s.value,'$.consent'))=?`,stamp(),snapshot,members.length));
    batch.push(statement(`INSERT INTO newsletter_recipients(dispatch_id,player_id,email,consent_id) SELECT ?,p.id,p.email,p.consent_id FROM (${eligibleSql}) p JOIN json_each(?) s ON p.id=json_extract(s.value,'$.id') AND p.email=json_extract(s.value,'$.email') AND p.consent_id=json_extract(s.value,'$.consent')`,id,stamp(),snapshot));
    await privacyDb().batch(batch);return {id};
  }
  throw Error('Ukendt handling.');
}
export async function sendRecipient(actor:number,dispatchId:string,playerId:number,confirm:boolean) {
  if(!confirm)throw Error('Bekræft afsendelsen.');
  const env=getCloudflareContext().env as CloudflareEnv & {NEWSLETTER_ENABLED?:string;RESEND_API_KEY?:string};
  if(env.NEWSLETTER_ENABLED!=='true'||!env.RESEND_API_KEY)throw Error('Nyhedsbrevsafsendelse er ikke aktiveret i dette miljø.');
  const r=await one('SELECT r.*,d.subject,d.body FROM newsletter_recipients r JOIN newsletter_dispatches d ON d.id=r.dispatch_id WHERE r.dispatch_id=? AND r.player_id=?',dispatchId,playerId);
  if(!r||r.status!=='prepared')throw Error('Modtageren er allerede behandlet. Usikker afsendelse må ikke automatisk gentages.');
  const candidate=await one(eligibleSql+' AND p.id=?',stamp(),playerId);
  const p=candidate&&validEmail(candidate.email)&&candidate.email===r.email&&candidate.consent_id===r.consent_id?candidate:null;
  if(!p){await statement("UPDATE newsletter_recipients SET status='excluded' WHERE dispatch_id=? AND player_id=? AND status='prepared'",dispatchId,playerId).run();throw Error('Modtageren er ikke længere tilmeldt.');}
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32)),b=>b.toString(16).padStart(2,'0')).join(''),now=stamp();
  await privacyDb().batch([guard(admin,actor),guard(`EXISTS(SELECT 1 FROM (${eligibleSql}) WHERE id=? AND consent_id=? AND email=?)`,now,playerId,p.consent_id,p.email),guard("EXISTS(SELECT 1 FROM newsletter_recipients WHERE dispatch_id=? AND player_id=? AND status='prepared')",dispatchId,playerId),statement('INSERT INTO newsletter_tokens VALUES(?,?,?,?,?,NULL)',await sha256(token),playerId,p.email_revision,p.consent_id,now),statement("UPDATE newsletter_recipients SET status='sending',attempt_at=? WHERE dispatch_id=? AND player_id=?",now,dispatchId,playerId)]);
  const text=`${r.body}\n\nAfmeld eller pause i 30 døgn: https://aabenbaneaften.dk/newsletter#${token}`;
  let status='uncertain',providerId:string|null=null;
  try {
    const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`newsletter/${dispatchId}/${playerId}`},body:JSON.stringify({from:'Åben Bane Aften <mail@aabenbaneaften.dk>',reply_to:'aabenbaneaften@hik.dk',to:[p.email],subject:r.subject,text})});
    if(response.ok){providerId=(await response.json() as {id?:string}).id??null;status='sent';}else status=response.status>=500?'uncertain':'failed';
  } catch { /* Timeout may have occurred after provider accepted the message. Never blindly resend. */ }
  await statement('UPDATE newsletter_recipients SET status=?,sent_at=?,provider_id=? WHERE dispatch_id=? AND player_id=?',status,status==='sent'?stamp():null,providerId,dispatchId,playerId).run();
  if(status!=='sent')throw Error('Afsendelsen er fejlet eller usikker. Kontrollér mailudbyderen før yderligere handling.');
  return {status,delivered:false};
}
