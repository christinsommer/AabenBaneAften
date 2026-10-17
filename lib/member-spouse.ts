import {and,eq,sql} from 'drizzle-orm';
import {getDb} from '../db';
import {players} from '../db/schema';
import {spouseSettings} from './spouse-settings';

const active=sql`EXISTS (SELECT 1 FROM profile_privacy WHERE player_id=${players.id} AND closed_at IS NULL)`;
export async function findSpouses(query:unknown,selfId:number) {
  const value=String(query??'').normalize('NFKC').trim().replace(/\s+/g,' ').toLocaleLowerCase('da-DK');
  if(value.length>100||(value.match(/\p{L}/gu)??[]).length<3)return [];
  const rows=await getDb().select({id:players.id,name:players.name,memberNo:players.memberNo}).from(players).where(active);
  return rows.filter(p=>p.id!==selfId&&/^\d+$/.test(p.memberNo)&&Number.isSafeInteger(Number(p.memberNo))&&Number(p.memberNo)>0&&p.name.normalize('NFKC').toLocaleLowerCase('da-DK').includes(value))
    .sort((a,b)=>a.name.localeCompare(b.name,'da')).slice(0,20).map(({id,name})=>({id,name}));
}
export async function selectedSpouse(id:unknown,user:{id:number;memberNo:string;spouseNo:number|null;spouseMode:number|null}) {
  if(id===null)return {spouseNo:null,spouseMode:null};
  if(typeof id!=='number'||!Number.isSafeInteger(id)||id<1||id===user.id)throw new Error('Vælg en anden spiller fra søgeresultaterne.');
  const [target]=await getDb().select({memberNo:players.memberNo}).from(players).where(and(eq(players.id,id),active));
  if(!target||!/^\d+$/.test(target.memberNo))throw new Error('Spilleren er ikke tilgængelig. Søg igen.');
  return spouseSettings({spouseNo:Number(target.memberNo),spouseMode:1},user,user.memberNo,await getDb().select({memberNo:players.memberNo}).from(players));
}
export async function currentSpouse(spouseNo:number|null) {
  if(spouseNo==null)return null;
  const rows=await getDb().select({id:players.id,name:players.name}).from(players).where(and(sql`${players.memberNo} NOT GLOB '*[^0-9]*' AND CAST(${players.memberNo} AS INTEGER)=${spouseNo}`,active));
  return rows.length===1?rows[0]:null;
}
