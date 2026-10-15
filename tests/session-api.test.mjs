import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {hashPin,sha256} from '../lib/credentials.ts';

test('session lifetimes, idle activity, revocation and email reauthentication against D1', {timeout:180000}, async()=>{
  const folder=mkdtempSync(join(process.cwd(),'.session-test-'));
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(folder,'db')}});
    const db=proxy.env.DB, jar=new Map();
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    const pinHash=await hashPin('0123');
    const insert=async(no,role)=>(await db.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES(?,?,'Test','Member',?,'K','B',?,?) RETURNING id")
      .bind(no,no,`${no}@example.test`,pinHash,role).first()).id;
    const playerId=await insert('player','player'), adminId=await insert('admin','admin');
    let options;
    globalThis.__sessionTest={env:{DB:db,SUPERADMIN_PLAYER_ID:String(adminId)},cookies:{
      get:name=>jar.has(name)?{value:jar.get(name)}:undefined,
      set:(name,value,o)=>{jar.set(name,value);options=o;},delete:name=>jar.delete(name),
    }};
    const entry=join(folder,'entry.ts'),outfile=join(folder,'bundle.mjs');
    writeFileSync(entry,"export * from '../lib/auth'; export * as app from '../app/api/app/route'; export * as privacy from '../app/api/privacy/route';");
    await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'session-context',setup(builder){
        builder.onResolve({filter:/^next\/server$/},()=>({path:'next/server.js',external:true}));
        builder.onResolve({filter:/^(next\/headers|@opennextjs\/cloudflare)$/},args=>({path:args.path,namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='next/headers'
          ? 'export const cookies=async()=>globalThis.__sessionTest.cookies;'
          : 'export const getCloudflareContext=()=>({env:globalThis.__sessionTest.env});'}));
      }
    }]});
    const {createSession,currentPlayer,app,privacy}=await import(pathToFileURL(outfile).href);
    const cookie='aaben_bane_session';
    const session=async()=>db.prepare('SELECT * FROM sessions WHERE token_hash=?').bind(await sha256(jar.get(cookie))).first();
    const post=(body,module=app)=>module.POST(new Request('https://example.test/api/app',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    const age=async(idleMs,absoluteMs)=>db.prepare('UPDATE sessions SET last_seen_at=?,created_at=? WHERE token_hash=?')
      .bind(new Date(Date.now()-idleMs).toISOString(),new Date(Date.now()-absoluteMs).toISOString(),await sha256(jar.get(cookie))).run();
    for(const [id,idleMinutes,hours] of [[playerId,30,8],[adminId,15,4]]) {
      await createSession(id);
      let row=await session();
      assert.equal(Date.parse(row.expires_at)-Date.parse(row.created_at),hours*3600000);
      assert.equal(options.expires.toISOString(),row.expires_at);
      assert.equal(options.httpOnly,true);
      await age((idleMinutes-1)*60000,3600000);
      row=await session();
      assert.equal((await app.GET()).status,200);
      assert.equal((await session()).last_seen_at,row.last_seen_at,'background polling must not refresh activity');
      assert.equal((await post({action:'activity'},privacy)).status,200);
      assert.ok(Date.parse((await session()).last_seen_at)>Date.parse(row.last_seen_at));
      assert.equal((await session()).expires_at,row.expires_at,'activity must not extend absolute expiry');
      await age(idleMinutes*60000+1000,3600000);
      const expiredToken=jar.get(cookie);
      assert.equal((await post({action:'activity'},privacy)).status,401,'activity cannot revive an idle session');
      jar.set(cookie,expiredToken);
      assert.equal(await currentPlayer(),null);
      assert.equal(jar.has(cookie),false);

      await createSession(id);
      await age(0,hours*3600000+1000);
      assert.equal(await currentPlayer({touch:true}),null,'recent activity cannot bypass absolute lifetime');
      await createSession(id);
      await db.prepare('UPDATE sessions SET last_seen_at=NULL WHERE token_hash=?').bind(await sha256(jar.get(cookie))).run();
      assert.equal(await currentPlayer(),null,'legacy 30-day sessions require new login');
    }
    // A promoted account immediately adopts administrator limits.
    await createSession(playerId);
    await age(16*60000,3600000);
    await db.prepare("UPDATE players SET role='admin' WHERE id=?").bind(playerId).run();
    assert.equal(await currentPlayer(),null);
    await db.prepare("UPDATE players SET role='player' WHERE id=?").bind(playerId).run();

    await createSession(playerId);const deviceA=jar.get(cookie);
    await createSession(playerId);const deviceB=jar.get(cookie);
    await createSession(adminId);const adminDevice=jar.get(cookie);
    jar.set(cookie,deviceA);
    assert.equal((await post({action:'logout_all'})).status,200);
    assert.equal(jar.has(cookie),false);
    jar.set(cookie,deviceB);assert.equal(await currentPlayer(),null);
    jar.set(cookie,adminDevice);assert.equal((await currentPlayer()).id,adminId);

    await createSession(playerId);const oldDevice=jar.get(cookie);
    await createSession(playerId);const oldCurrent=jar.get(cookie);
    await db.prepare("INSERT INTO pin_reset_tokens(player_id,token_hash,expires_at) VALUES(?,'old-reset','2099-01-01')").bind(playerId).run();
    const profile={action:'update_profile',firstName:'Test',lastName:'Member',email:'new@example.test',gender:'K',level:'B'};
    assert.equal((await post(profile)).status,403);
    assert.equal((await post({...profile,currentPin:'9999'})).status,403);
    assert.equal((await db.prepare('SELECT email FROM players WHERE id=?').bind(playerId).first()).email,'player@example.test');
    assert.equal((await post({...profile,currentPin:'0123'})).status,200);
    const renewed=jar.get(cookie);assert.notEqual(renewed,oldCurrent);
    assert.equal((await currentPlayer()).email,'new@example.test');
    assert.equal((await db.prepare('SELECT count(*) n FROM pin_reset_tokens WHERE player_id=?').bind(playerId).first()).n,0);
    for(const token of [oldDevice,oldCurrent]){jar.set(cookie,token);assert.equal(await currentPlayer(),null);}
    jar.set(cookie,renewed);
    assert.equal((await post({...profile,phone:'12345678'})).status,200,'unchanged email needs no PIN');
    jar.set(cookie,adminDevice);
    const adminEdit={...profile,action:'update_member',playerId,email:'admin-edited@example.test',christinRanking:null};
    assert.equal((await post(adminEdit)).status,403);
    assert.equal((await post({...adminEdit,currentPin:'0123'})).status,200);
    jar.set(cookie,renewed);assert.equal(await currentPlayer(),null,'admin email edits revoke target sessions');
  } finally {
    delete globalThis.__sessionTest;
    await proxy?.dispose();
    rmSync(folder,{recursive:true,force:true});
  }
});
