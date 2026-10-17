import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync,writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {hashPin,sha256} from '../lib/credentials.ts';
import {totp} from '../lib/totp.ts';

test('SuperAdmin MFA reset requires own factors and identity confirmation, revokes target access and audits atomically', {timeout:180000}, async()=>{
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
    globalThis.__sessionTest={env:{DB:db,SUPERADMIN_PLAYER_ID:String(adminId),MFA_ENCRYPTION_KEY:'a'.repeat(64)},cookies:{
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
    const post=body=>app.POST(new Request('https://example.test/api/app',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    const clearLimits=()=>db.prepare('DELETE FROM auth_rate_limits').run();
    const enroll=async memberNo=>{
      jar.clear(); // Separate browsers: logging in must not revoke the previous actor's session.
      await clearLimits();
      const setup=await (await post({action:'login',memberNo,pin:'0123'})).json();
      assert.equal(setup.mfa.stage,'setup');
      const response=await post({action:'mfa_verify',code:await totp(setup.mfa.secret,Math.floor(Date.now()/30000)),remember:true});
      assert.equal(response.status,200,await response.clone().text());
      return {cookies:new Map(jar),codes:(await response.json()).recoveryCodes};
    };
    const useCookies=values=>{jar.clear();for(const [key,value]of values)jar.set(key,value);};
    const targetId=await insert('target','admin'),closedId=await insert('closed','admin');
    const owner=await enroll('admin'),target=await enroll('target');
    await db.prepare("UPDATE profile_privacy SET closed_at='2026-10-16' WHERE player_id=?").bind(closedId).run();
    const payload={action:'mfa_reset_admin',playerId:targetId,currentPin:'0123',code:owner.codes[0],identityConfirmed:true};
    assert.equal((await post({...payload,playerId:adminId})).status,403,'normal admin cannot reset anyone');
    jar.clear();assert.equal((await post(payload)).status,401);
    await post({action:'login',memberNo:'player',pin:'0123'});
    assert.equal((await post(payload)).status,403);
    useCookies(owner.cookies);
    for(const change of [{identityConfirmed:false},{identityConfirmed:'true'},{playerId:adminId},{playerId:playerId},{playerId:closedId},{playerId:99999},{playerId:'3'}])assert.equal((await post({...payload,...change})).status,400);
    await clearLimits();
    assert.equal((await post({...payload,currentPin:'9999'})).status,403);
    await clearLimits();
    assert.equal((await post({...payload,code:'invalid'})).status,400);
    const original=await db.prepare('SELECT * FROM admin_mfa WHERE player_id=?').bind(targetId).first();
    assert.ok(original);
    // A mandatory audit write failure must roll back proof consumption and reset.
    await db.prepare("CREATE TRIGGER fail_mfa_audit BEFORE INSERT ON security_mfa_events BEGIN SELECT RAISE(ABORT,'Test audit unavailable'); END").run();
    await clearLimits();assert.equal((await post(payload)).status,500);
    assert.deepEqual(await db.prepare('SELECT * FROM admin_mfa WHERE player_id=?').bind(targetId).first(),original);
    assert.ok(JSON.parse((await db.prepare('SELECT recovery_hashes FROM admin_mfa WHERE player_id=?').bind(adminId).first()).recovery_hashes).includes(await sha256(owner.codes[0])));
    await db.prepare('DROP TRIGGER fail_mfa_audit').run();
    await db.prepare("INSERT INTO mfa_challenges VALUES('pending-target',?,? ,?,NULL,9999999999999,0)").bind(targetId,pinHash,original.version).run();
    await db.prepare("INSERT INTO pin_reset_tokens(player_id,token_hash,expires_at) VALUES(?,'pending-reset','2099-01-01')").bind(targetId).run();
    await clearLimits();
    const reset=await post(payload);assert.equal(reset.status,200,await reset.clone().text());
    for(const table of ['admin_mfa','sessions','trusted_devices','mfa_challenges','pin_reset_tokens'])assert.equal((await db.prepare(`SELECT count(*) n FROM ${table} WHERE player_id=?`).bind(targetId).first()).n,0,table+' revoked');
    const player=await db.prepare('SELECT role,pin_hash FROM players WHERE id=?').bind(targetId).first();assert.deepEqual(player,{role:'admin',pin_hash:pinHash});
    const log=(await db.prepare('SELECT * FROM security_mfa_events').all()).results;
    assert.equal(log.length,1);assert.equal(log[0].actor_id,adminId);assert.equal(log[0].target_id,targetId);assert.equal(log[0].action,'admin_reset');assert.equal(log[0].identity_confirmed,1);
    assert.ok(!JSON.stringify(log).includes(owner.codes[0]));
    assert.equal((await currentPlayer()).id,adminId,'SuperAdmin session remains valid');
    useCookies(target.cookies);assert.equal(await currentPlayer(),null,'old session rejected');
    const newSetup=await (await post({action:'login',memberNo:'target',pin:'0123'})).json();assert.equal(newSetup.mfa.stage,'setup','old remembered browser cannot skip new setup');
    assert.equal(await currentPlayer(),null);
    const reactivated=await post({action:'mfa_verify',code:await totp(newSetup.mfa.secret,Math.floor(Date.now()/30000))});assert.equal(reactivated.status,200);
    useCookies(owner.cookies);await clearLimits();
    assert.equal((await post(payload)).status,400,'SuperAdmin second factor cannot be reused for another reset');
    assert.equal((await db.prepare('SELECT count(*) n FROM security_mfa_events').first()).n,1);
  } finally {
    delete globalThis.__sessionTest;
    await proxy?.dispose();
    rmSync(folder,{recursive:true,force:true});
  }
});
