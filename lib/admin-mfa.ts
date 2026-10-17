import {getCloudflareContext} from '@opennextjs/cloudflare';
import {cookies} from 'next/headers';
import {hex,sha256} from './credentials';
import {base32,matchTotp} from './totp';
import {authRateLimit} from './auth-rate-limit';
import {isSuperAdmin} from './superadmin';

const CHALLENGE='aaben_bane_mfa',TRUST='aaben_bane_trusted';
const challengeMs=10*60_000,trustMs=14*86400_000;
const db=()=>getCloudflareContext().env.DB;
const query=(sql:string,...args:(string|number|null)[])=>db().prepare(sql).bind(...args);
const random=()=>hex(crypto.getRandomValues(new Uint8Array(32)));
const cookieOptions={httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'strict' as const,path:'/'};
type Credential={secret:string;version:string;last_step:number;recovery_hashes:string};
type Challenge={token_hash:string;player_id:number;pin_hash:string;expected_version:string|null;secret:string|null;expires_at:number;attempts:number};
export class MfaError extends Error {
 constructor(message:string,public status=400){super(message);}
}
export const mfaCredential=(id:number)=>query('SELECT * FROM admin_mfa WHERE player_id=?',id).first<Credential>();
async function encryptionKey() {
 const raw=(getCloudflareContext().env as CloudflareEnv & {MFA_ENCRYPTION_KEY?:string}).MFA_ENCRYPTION_KEY;
 if(!raw||!/^[a-f0-9]{64}$/i.test(raw))throw new MfaError('2FA er ikke konfigureret på serveren. Kontakt driftsansvarlig.',503);
 return crypto.subtle.importKey('raw',Uint8Array.from(raw.match(/../g)!,s=>parseInt(s,16)),'AES-GCM',false,['encrypt','decrypt']);
}
async function seal(secret:string,id:number) {
 const iv=crypto.getRandomValues(new Uint8Array(12));
 const data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`admin-mfa:${id}`)},await encryptionKey(),new TextEncoder().encode(secret));
 return `${hex(iv)}.${hex(new Uint8Array(data))}`;
}
async function unseal(value:string,id:number) {
 const [iv,data]=value.split('.').map(part=>Uint8Array.from(part.match(/../g)!,s=>parseInt(s,16)));
 return new TextDecoder().decode(await crypto.subtle.decrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(`admin-mfa:${id}`)},await encryptionKey(),data));
}
export async function clearMfaChallenge() {
 const jar=await cookies(),token=jar.get(CHALLENGE)?.value;
 if(token)await query('DELETE FROM mfa_challenges WHERE token_hash=?',await sha256(token)).run();
 jar.delete(CHALLENGE);
}
export async function forgetTrustedDevices(id:number) {
 await query('DELETE FROM trusted_devices WHERE player_id=?',id).run();
 (await cookies()).delete(TRUST);
}
export async function trustedMfaVersion(id:number) {
 const token=(await cookies()).get(TRUST)?.value;
 if(!token)return null;
 const row=await query('SELECT d.mfa_version FROM trusted_devices d JOIN admin_mfa m ON m.player_id=d.player_id AND m.version=d.mfa_version WHERE d.token_hash=? AND d.player_id=? AND d.expires_at>?',await sha256(token),id,Date.now()).first<{mfa_version:string}>();
 return row?.mfa_version??null;
}
export async function beginMfa(player:{id:number;pinHash:string;memberNo:string},replace=false) {
 await encryptionKey(); // Fail closed before starting either setup or verification.
 await clearMfaChallenge();
 const credential=await mfaCredential(player.id);
 const secret=!credential||replace?base32(crypto.getRandomValues(new Uint8Array(20))):null;
 const token=random(),expires=Date.now()+challengeMs;
 await db().batch([
  query('DELETE FROM mfa_challenges WHERE expires_at<=?',Date.now()),
  query('DELETE FROM trusted_devices WHERE expires_at<=?',Date.now()),
  query('INSERT INTO mfa_challenges(token_hash,player_id,pin_hash,expected_version,secret,expires_at) VALUES(?,?,?,?,?,?)',await sha256(token),player.id,player.pinHash,credential?.version??null,secret?await seal(secret,player.id):null,expires),
 ]);
 (await cookies()).set(CHALLENGE,token,{...cookieOptions,expires:new Date(expires)});
 if(!secret)return {authenticated:false,mfa:{stage:'verify' as const}};
 const issuer='Åben Bane Aften';
 const uri=`otpauth://totp/${encodeURIComponent(`${issuer}:${player.memberNo}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
 return {authenticated:false,mfa:{stage:'setup' as const,secret,uri}};
}
const guardChanges=()=>query("SELECT CASE WHEN changes()=1 THEN 1 ELSE json('2FA state changed') END");
// Proof updates are conditional and committed with challenge consumption, so a
// TOTP step/recovery code cannot authenticate two concurrent requests.
async function proofStatements(id:number,credential:Credential,code:string) {
 const step=await matchTotp(await unseal(credential.secret,id),code);
 if(step!==null&&step>credential.last_step)return [query('UPDATE admin_mfa SET last_step=? WHERE player_id=? AND version=? AND last_step<?',step,id,credential.version,step),guardChanges()];
 const normalized=code.replace(/[-\s]/g,'').toLowerCase();
 if(!/^[a-f0-9]{32}$/.test(normalized))throw new MfaError('Koden er forkert eller allerede brugt. Vent på en ny kode, og prøv igen.');
 const hash=await sha256(normalized),hashes=JSON.parse(credential.recovery_hashes) as string[];
 if(!hashes.includes(hash))throw new MfaError('Gendannelseskoden er forkert eller allerede brugt.');
 return [query('UPDATE admin_mfa SET recovery_hashes=? WHERE player_id=? AND version=? AND recovery_hashes=?',JSON.stringify(hashes.filter(h=>h!==hash)),id,credential.version,credential.recovery_hashes),guardChanges(),query('DELETE FROM trusted_devices WHERE player_id=?',id)];
}
export async function verifyCurrentMfa(request:Request,id:number,code:string) {
 const limited=await authRateLimit(request,'mfa',String(id));if(limited)return limited;
 const credential=await mfaCredential(id);if(!credential)throw new MfaError('2FA er ikke aktiveret.');
 await db().batch(await proofStatements(id,credential,code));
 return null;
}
export async function resetOtherAdminMfa(request:Request,actor:{id:number;role:string;pinHash:string},targetId:number,code:string) {
 if(!isSuperAdmin(actor)||targetId===actor.id)throw new MfaError('Kun SuperAdmin kan nulstille en anden Admins 2FA.',403);
 const limited=await authRateLimit(request,'mfa',String(actor.id));if(limited)return limited;
 const credential=await mfaCredential(actor.id),target=await mfaCredential(targetId);
 if(!credential)throw new MfaError('Bekræft din egen 2FA først.',403);
 if(!target)throw new MfaError('Denne administrator har ingen aktiveret 2FA at nulstille.',409);
 const proof=await proofStatements(actor.id,credential,code);
 // Authorization, one-use proof, revocation and mandatory audit commit together.
 // A changed role, PIN, credential or closed account rolls back the entire reset.
 const validAccount="SELECT 1 FROM players p JOIN profile_privacy a ON a.player_id=p.id WHERE p.id=? AND p.role='admin' AND a.closed_at IS NULL";
 await db().batch([
  query(`SELECT CASE WHEN EXISTS(${validAccount} AND p.pin_hash=?) AND EXISTS(${validAccount}) THEN 1 ELSE json('Admin access changed') END`,actor.id,actor.pinHash,targetId),
  ...proof,
  query('DELETE FROM admin_mfa WHERE player_id=? AND version=?',targetId,target.version),guardChanges(),
  query('DELETE FROM sessions WHERE player_id=?',targetId),
  query('DELETE FROM trusted_devices WHERE player_id=?',targetId),
  query('DELETE FROM mfa_challenges WHERE player_id=?',targetId),
  query('DELETE FROM pin_reset_tokens WHERE player_id=?',targetId),
  query("INSERT INTO security_mfa_events(id,occurred_at,actor_id,target_id,action,identity_confirmed) VALUES(?,?,?,?,'admin_reset',1)",crypto.randomUUID(),Math.floor(Date.now()/1000),actor.id,targetId),
 ]);
 return null;
}
export async function finishMfa(request:Request,code:string,remember:boolean) {
 const token=(await cookies()).get(CHALLENGE)?.value;
 if(!token)throw new MfaError('Loginforsøget er udløbet. Log ind igen med medlemsnummer og PIN.');
 const tokenHash=await sha256(token);
 const challenge=await query('SELECT * FROM mfa_challenges WHERE token_hash=? AND expires_at>?',tokenHash,Date.now()).first<Challenge>();
 if(!challenge)throw new MfaError('Loginforsøget er udløbet. Log ind igen.');
 const limited=await authRateLimit(request,'mfa',String(challenge.player_id));if(limited)return {limited};
 const attempt=await query('UPDATE mfa_challenges SET attempts=attempts+1 WHERE token_hash=? AND attempts<8 AND expires_at>? RETURNING token_hash',tokenHash,Date.now()).first();
 if(!attempt)throw new MfaError('For mange forsøg. Start login igen.');
 const id=challenge.player_id,credential=await mfaCredential(id);
 const active=await query("SELECT p.id FROM players p JOIN profile_privacy a ON a.player_id=p.id WHERE p.id=? AND p.pin_hash=? AND p.role='admin' AND a.closed_at IS NULL",id,challenge.pin_hash).first();
 if(!active||(credential?.version??null)!==challenge.expected_version)throw new MfaError('Kontoen er ændret. Start login igen.');
 const version=challenge.secret?random():credential!.version;
 const statements=[query("DELETE FROM mfa_challenges WHERE token_hash=? AND expires_at>? AND EXISTS(SELECT 1 FROM players p JOIN profile_privacy a ON a.player_id=p.id WHERE p.id=? AND p.pin_hash=? AND p.role='admin' AND a.closed_at IS NULL) AND (SELECT version FROM admin_mfa WHERE player_id=?) IS ?",tokenHash,Date.now(),id,challenge.pin_hash,id,challenge.expected_version),guardChanges()];
 let recoveryCodes:string[]|undefined;
 if(challenge.secret) {
  const step=await matchTotp(await unseal(challenge.secret,id),code);
  if(step===null)throw new MfaError('Koden er forkert. Kontrollér koden og telefonens klokkeslæt.');
  recoveryCodes=Array.from({length:10},()=>hex(crypto.getRandomValues(new Uint8Array(16))));
  const hashes=await Promise.all(recoveryCodes.map(value=>sha256(value)));
  statements.push(query('INSERT INTO admin_mfa(player_id,secret,version,last_step,recovery_hashes) VALUES(?,?,?,?,?) ON CONFLICT(player_id) DO UPDATE SET secret=excluded.secret,version=excluded.version,last_step=excluded.last_step,recovery_hashes=excluded.recovery_hashes',id,challenge.secret,version,step,JSON.stringify(hashes)),query('DELETE FROM trusted_devices WHERE player_id=?',id),query('DELETE FROM sessions WHERE player_id=?',id),query('DELETE FROM mfa_challenges WHERE player_id=?',id));
 } else statements.push(...await proofStatements(id,credential!,code));
 const trustToken=remember?random():null,expires=Date.now()+trustMs;
 if(trustToken)statements.push(query('INSERT INTO trusted_devices(token_hash,player_id,mfa_version,expires_at) VALUES(?,?,?,?)',await sha256(trustToken),id,version,expires));
 await db().batch(statements);
 const jar=await cookies();jar.delete(CHALLENGE);
 if(trustToken)jar.set(TRUST,trustToken,{...cookieOptions,expires:new Date(expires)});
 return {playerId:id,version,recoveryCodes};
}
