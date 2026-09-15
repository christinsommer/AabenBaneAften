import assert from 'node:assert/strict';
import {randomInt, randomBytes} from 'node:crypto';
import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {getPlatformProxy} from 'wrangler';
import {hashPin} from '../lib/credentials.ts';
import {copenhagenDate} from '../lib/calendar.ts';
import {currentYear} from '../lib/birth-year.ts';

if (process.argv.slice(2).join(' ') !== '--local') throw new Error('Use --local. This script only seeds the local sandbox.');
const config = JSON.parse(readFileSync('wrangler.jsonc','utf8'));
if (config.d1_databases.some(binding => binding.remote)) throw new Error('Remote bindings are not permitted.');
const shuffle = values => {
  const result = [...values];
  for (let i=result.length-1;i>0;i--) {const j=randomInt(i+1);[result[i],result[j]]=[result[j],result[i]];}
  return result;
};
const female = shuffle(['Anna','Sofie','Emma','Clara','Laura','Freja','Ida','Alma','Agnes','Ella','Karla','Josefine','Lærke','Mathilde','Sara','Nora','Signe','Maja','Julie','Maria','Louise','Camilla','Line','Pernille','Anne','Trine','Helle','Lone']);
const male = shuffle(['William','Oscar','Carl','Noah','Oliver','Alfred','Aksel','Emil','August','Victor','Malthe','Frederik','Lucas','Elias','Magnus','Mikkel','Jonas','Rasmus','Thomas','Peter','Henrik','Lars']);
const surnames = ['Lund','Holm','Berg','Dahl','Møller','Nielsen','Jensen','Hansen','Sørensen','Larsen'];
const genders = shuffle([...Array(28).fill('K'),...Array(22).fill('M')]);
const early = ['18:00','18:30','19:00'];
const wishes = shuffle([
  ...Array.from({length:35},(_,i)=>({hours:i<18?2:1,availability:early})),
  ...Array.from({length:15},(_,i)=>{
    if(i<2) return {hours:3,availability:['18:00','18:30','19:00','19:30','20:00']};
    const availability = i<10
      ? shuffle([['18:00','19:00','19:30','20:00'],['18:30','19:30'],['19:00','20:00'],['18:00','18:30','19:00','19:30']])[0]
      : shuffle([['19:30'],['20:00'],['19:00','19:30','20:00']])[0];
    return {hours:i<10?2:1,availability};
  }),
]);
const run = `${Date.now()}-${randomBytes(3).toString('hex')}`;
const rows = wishes.map((wish,i)=>{
  const gender=genders[i], firstName=(gender==='K'?female:male).pop();
  const lastName=`Sandbox ${surnames[randomInt(surnames.length)]}`;
  return {memberNo:`SB50-${run}-${String(i+1).padStart(2,'0')}`,firstName,lastName,name:`${firstName} ${lastName}`,gender,
    cr:randomInt(1,10),birthYear:currentYear()-randomInt(20,76),hours:wish.hours,availability:[...wish.availability].sort()};
});
// Validate the requested distributions before any database mutation.
assert.equal(rows.length,50);
assert.equal(rows.filter(p=>p.gender==='K').length,28);
const restricted = rows.filter(p=>p.availability.every(t=>early.includes(t)));
assert.equal(restricted.length,35);
assert.equal(restricted.filter(p=>p.hours===2).length,18);
assert.equal(rows.filter(p=>p.hours===3).length,2);
assert.ok(rows.every(p=>!p.availability.includes('20:30')&&!p.availability.includes('21:00')));
assert.ok(rows.every(p=>p.memberNo.length<=30));
for(const p of rows) {
  const starts=p.availability.map(t=>Number(t.slice(0,2))*60+Number(t.slice(3)));
  let last=-Infinity, possibleHours=0;
  for(const start of starts) if(start>=last+60) {last=start;possibleHours++;}
  assert.ok(possibleHours>=p.hours,'Each requested duration must be possible without overlapping its own availability.');
}
const proxy = await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:'.wrangler/local-dev/v3'}});
try {
  const db=proxy.env.DB;
  const previousActive=(await db.prepare('SELECT id,date FROM events WHERE test_active=1').all()).results;
  const eventId=(await db.prepare('SELECT COALESCE(MAX(id),0)+1 AS id FROM events').first()).id;
  let date=copenhagenDate();
  while(await db.prepare('SELECT id FROM events WHERE date=?').bind(date).first()) {
    const next=new Date(`${date}T12:00:00Z`);next.setUTCDate(next.getUTCDate()+1);date=next.toISOString().slice(0,10);
  }
  // Random undisclosed PIN prevents these fictitious profiles from sharing a known login.
  const pinHash=await hashPin(randomBytes(32).toString('hex'));
  mkdirSync('work',{recursive:true});
  const manifest={run,eventId,date,previousActive,memberNos:rows.map(p=>p.memberNo)};
  writeFileSync(`work/sandbox-signups-${run}.json`,JSON.stringify(manifest,null,2));
  const statements=[
    db.prepare('UPDATE events SET test_active=0 WHERE test_active=1'),
    db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override,status,is_test,test_active) VALUES(?,?,?,?,'closed','draft',1,1)")
      .bind(eventId,date,`${date}T00:00:00Z`,`${date}T00:00:00Z`),
  ];
  for(const [index,p] of rows.entries()) {
    statements.push(db.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,christin_ranking,birth_year,pin_hash) VALUES(?,?,?,?,?,?,'B',?,?,?)")
      .bind(p.memberNo,p.name,p.firstName,p.lastName,`sandbox-${run}-${index+1}@example.invalid`,p.gender,p.cr,p.birthYear,pinHash));
    statements.push(db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours,status) SELECT ?,id,?,?,'active' FROM players WHERE member_no=?")
      .bind(eventId,JSON.stringify(p.availability),p.hours,p.memberNo));
  }
  await db.batch(statements);
  const saved=(await db.prepare('SELECT p.member_no,p.name,p.gender,p.christin_ranking,p.birth_year,s.availability,s.requested_hours,s.signup_order FROM signups s JOIN players p ON p.id=s.player_id WHERE s.event_id=? ORDER BY s.signup_order').bind(eventId).all()).results;
  assert.equal(saved.length,50);
  assert.equal(new Set(saved.map(p=>p.signup_order)).size,50);
  assert.equal(saved.filter(p=>p.gender==='K').length,28);
  assert.equal(saved.filter(p=>p.requested_hours===3).length,2);
  writeFileSync('work/sandbox-50-signups.json',JSON.stringify({eventId,date,rows:saved},null,2));
  console.log(JSON.stringify({eventId,date,signups:saved.length,women:28,men:22,earlyOnly:35,earlyTwoHours:18,
    hours:{one:22,two:26,three:2},totalRequestedHours:80,registration:'closed',environment:'local sandbox'},null,2));
} finally {await proxy.dispose();}
