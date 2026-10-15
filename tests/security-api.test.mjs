import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {hashPin,sha256} from '../lib/credentials.ts';
import {PRIVACY_VERSION} from '../lib/privacy-text.ts';

test('security: shared throttling, SuperAdmin-only roles and scoped member names', {timeout:180000}, async()=>{
  const directory=mkdtempSync(join(process.cwd(),'.security-test-'));
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB, jar=new Map();
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    globalThis.__securityTest={env:{DB:db},mails:0,cookies:{
      get:name=>jar.has(name)?{value:jar.get(name)}:undefined,
      set:(name,value)=>jar.set(name,value),delete:name=>jar.delete(name),
    }};
    const outfile=join(directory,'route.mjs');
    await build({entryPoints:['app/api/app/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'security-context',setup(builder){
        builder.onResolve({filter:/^next\/server$/},()=>({path:'next/server.js',external:true}));
        builder.onResolve({filter:/^(next\/headers|@opennextjs\/cloudflare)$/},args=>({path:args.path,namespace:'test'}));
        builder.onResolve({filter:/\/email$/},()=>({path:'email',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='next/headers'
          ? 'export const cookies=async()=>globalThis.__securityTest.cookies;'
          : args.path==='email' ? 'export async function sendEmail(){globalThis.__securityTest.mails++;}'
          : 'export const getCloudflareContext=()=>({env:globalThis.__securityTest.env});'}));
      }
    }]});
    const {POST,GET}=await import(pathToFileURL(outfile).href);
    const post=(body,ip='192.0.2.1')=>POST(new Request('https://example.test/api/app',{method:'POST',headers:{'content-type':'application/json','cf-connecting-ip':ip},body:JSON.stringify(body)}));
    const state=async()=>{const r=await GET();assert.equal(r.status,200);return r.json();};
    const clearLimits=()=>db.prepare('DELETE FROM auth_rate_limits').run();

    // Empty installation must never promote a public registration.
    const registered=await post({action:'register',memberNo:'first',firstName:'First',lastName:'Member',email:'first@example.test',gender:'K',level:'B',pin:'0123',privacyRead:true,privacyVersion:PRIVACY_VERSION});
    assert.equal(registered.status,200);
    const first=(await state()).user;
    assert.equal(first.role,'player');
    const insert=async(memberNo,role='player')=>(await db.prepare("INSERT INTO players(member_no,name,first_name,email,gender,self_level,pin_hash,role) VALUES(?,?,? ,?,'K','B',?,?) RETURNING id")
      .bind(memberNo,memberNo,memberNo,`${memberNo}@example.test`,await hashPin('0123'),role).first()).id;
    const admin=await insert('admin','admin'),hidden=await insert('Hidden Member'),opponent=await insert('Opponent');
    const event=(await state()).event;
    await db.prepare("INSERT INTO matches(event_id,court,start_time,player_ids) VALUES(?,1,'18:00',?)").bind(event.id,JSON.stringify([first.id,opponent])).run();
    assert.deepEqual((await state()).names.map(p=>p.id),[first.id]);
    await db.prepare("UPDATE events SET status='published' WHERE id=?").bind(event.id).run();
    assert.deepEqual((await state()).names.map(p=>p.id).sort(),[first.id,opponent].sort());
    await db.prepare("UPDATE events SET imported_kampplan=? WHERE id=?").bind(JSON.stringify([{A:'18:00',B:'19:00',C:'1',D:'First Member',E:'',F:'Opponent',G:''}]),event.id).run();
    assert.equal((await state()).names.some(p=>p.id===hidden),false);
    assert.equal((await post({action:'set_admin',playerId:hidden,makeAdmin:true})).status,403);
    await post({action:'login',memberNo:'admin',pin:'0123'});
    assert.ok((await state()).names.some(p=>p.id===hidden));
    assert.equal((await post({action:'set_admin',playerId:hidden,makeAdmin:true,adminPin:'0123'})).status,403);
    globalThis.__securityTest.env.SUPERADMIN_PLAYER_ID=String(admin);
    assert.equal((await post({action:'set_admin',playerId:hidden,makeAdmin:true,adminPin:'9999'})).status,403);
    assert.equal((await post({action:'set_admin',playerId:hidden,makeAdmin:true,adminPin:'0123'})).status,200);
    assert.equal((await db.prepare('SELECT role FROM players WHERE id=?').bind(hidden).first()).role,'admin');
    assert.equal((await post({action:'set_admin',playerId:hidden,makeAdmin:false,adminPin:'0123'})).status,200);
    assert.equal((await db.prepare('SELECT role FROM players WHERE id=?').bind(hidden).first()).role,'player');

    await clearLimits();
    const failures=await Promise.all(Array.from({length:10},(_,i)=>post({action:'login',memberNo:' first ',pin:'9999'},`192.0.2.${i+1}`)));
    assert.equal(failures.filter(r=>r.status===401).length,5);
    assert.equal(failures.filter(r=>r.status===429).length,5);
    assert.ok(Number(failures.find(r=>r.status===429).headers.get('retry-after'))>0);
    const accountKey=await sha256('login:account:first');
    const before=await db.prepare('SELECT * FROM auth_rate_limits WHERE key=?').bind(accountKey).first();
    assert.equal(before.attempts,5);
    // Blocked traffic cannot prolong the lockout; one later attempt doubles the delay.
    await post({action:'login',memberNo:'first',pin:'0123'},'192.0.2.99');
    assert.deepEqual(await db.prepare('SELECT * FROM auth_rate_limits WHERE key=?').bind(accountKey).first(),before);
    await db.prepare('UPDATE auth_rate_limits SET blocked_until=0 WHERE key=?').bind(accountKey).run();
    assert.equal((await post({action:'login',memberNo:'first',pin:'9999'})).status,401);
    const after=await db.prepare('SELECT * FROM auth_rate_limits WHERE key=?').bind(accountKey).first();
    assert.ok(after.blocked_until>=Math.floor(Date.now()/1000)+59);
    await db.prepare('UPDATE auth_rate_limits SET expires_at=0').run();
    assert.equal((await post({action:'login',memberNo:'first',pin:'0123'})).status,200);

    await clearLimits();
    for(let i=0;i<50;i++)assert.equal((await post({action:'login',memberNo:`unknown-${i}`,pin:'9999'})).status,401);
    assert.equal((await post({action:'login',memberNo:'new-unknown',pin:'9999'})).status,429);
    await clearLimits();
    const mailCount=globalThis.__securityTest.mails;
    const requests=await Promise.all(Array.from({length:8},(_,i)=>post({action:'request_pin_reset',memberNo:' first '},`192.0.2.${i+1}`)));
    assert.equal(requests.filter(r=>r.status===200).length,3);
    assert.equal(requests.filter(r=>r.status===429).length,5);
    assert.equal(globalThis.__securityTest.mails-mailCount,3);
    // Unknown accounts receive the same throttling without sending mail.
    for(let i=0;i<3;i++)assert.equal((await post({action:'request_pin_reset',memberNo:'missing'})).status,200);
    assert.equal((await post({action:'request_pin_reset',memberNo:'missing'})).status,429);
  } finally {
    delete globalThis.__securityTest;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
