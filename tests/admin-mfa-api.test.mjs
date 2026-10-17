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

test('administrator MFA setup, replay protection, remembered browsers and revocation against D1', {timeout:180000}, async()=>{
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
    const sessionCookie='aaben_bane_session',trustedCookie='aaben_bane_trusted',challengeCookie='aaben_bane_mfa';
    const post=(body,module=app)=>module.POST(new Request('https://example.test/api/app',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(body)}));
    const resetLimits=()=>db.prepare('DELETE FROM auth_rate_limits').run();
    const login=async(no='admin')=>{await resetLimits();return post({action:'login',memberNo:no,pin:'0123'});};
    const verify=async(code,remember=false)=>{await resetLimits();return post({action:'mfa_verify',code,remember});};
    const readCredential=()=>db.prepare('SELECT * FROM admin_mfa WHERE player_id=?').bind(adminId).first();
    assert.equal((await login('player')).status,200);
    assert.equal((await currentPlayer()).id,playerId);
    const setup=await (await login()).json();
    assert.equal(setup.authenticated,false);assert.equal(setup.mfa.stage,'setup');
    assert.equal(await currentPlayer(),null);
    assert.equal((await post({action:'update_birth_year',birthYear:1980})).status,401);
    assert.equal((await post({action:'activity'},privacy)).status,401);
    assert.equal(await readCredential(),null,'setup alone grants no admin access');
    await assert.rejects(()=>createSession(adminId));
    assert.equal((await db.prepare('SELECT count(*) n FROM sessions WHERE player_id=?').bind(adminId).first()).n,0);
    assert.equal((await verify('invalid')).ok,false);
    const secret=setup.mfa.secret,step=Math.floor(Date.now()/30000);
    const code=await totp(secret,step);
    const enrolled=await verify(code,true);
    const enrolledBody=await enrolled.json();
    assert.equal(enrolled.status,200,JSON.stringify(enrolledBody));
    const codes=enrolledBody.recoveryCodes;
    assert.equal(codes.length,10);
    assert.equal((await currentPlayer()).isSuperAdmin,true);
    const credential=await readCredential();
    assert.ok(!credential.secret.includes(secret));
    assert.ok(!credential.recovery_hashes.includes(codes[0]));
    const trusted=jar.get(trustedCookie);
    const trust=await db.prepare('SELECT * FROM trusted_devices WHERE token_hash=?').bind(await sha256(trusted)).first();
    assert.ok(Math.abs(trust.expires_at-Date.now()-14*86400000)<10000);
    assert.equal(options.httpOnly,true);
    await post({action:'logout'});
    assert.equal((await (await login()).json()).authenticated,true,'PIN plus trusted browser can log in');
    assert.equal((await db.prepare('SELECT expires_at FROM trusted_devices WHERE token_hash=?').bind(await sha256(trusted)).first()).expires_at,trust.expires_at,'login does not extend the 14 days');
    // A trust token is bound to the account and expiry.
    const otherId=await insert('otheradmin','admin');
    assert.equal((await (await login('otheradmin')).json()).mfa.stage,'setup');
    assert.equal(await currentPlayer(),null);
    await db.prepare('UPDATE trusted_devices SET expires_at=? WHERE player_id=?').bind(Date.now()-1,adminId).run();
    assert.equal((await (await login()).json()).mfa.stage,'verify');
    assert.equal((await verify(code)).ok,false,'used TOTP step cannot be replayed');
    const recovery=await verify(codes[0],true);
    assert.equal(recovery.status,200);
    const activeSession=jar.get(sessionCookie),rememberedAgain=jar.get(trustedCookie);
    assert.equal((await post({action:'mfa_forget_devices'})).status,200);
    jar.set(trustedCookie,rememberedAgain);
    assert.equal((await (await login()).json()).mfa.stage,'verify','forgotten token cannot authenticate');
    assert.equal((await verify(codes[0])).ok,false,'recovery codes are single-use');
    assert.equal((await verify(codes[1])).status,200);
    // Changing 2FA requires PIN and an existing second factor.
    assert.equal((await post({action:'mfa_replace',currentPin:'9999',code:codes[2]})).status,403);
    await resetLimits();
    const replacement=await (await post({action:'mfa_replace',currentPin:'0123',code:codes[2]})).json();
    assert.equal(replacement.mfa.stage,'setup');
    const replaced=await (await verify(await totp(replacement.mfa.secret,Math.floor(Date.now()/30000)),true)).json();
    assert.equal(replaced.recoveryCodes.length,10);
    jar.set(sessionCookie,activeSession);assert.equal(await currentPlayer(),null,'old sessions revoked on 2FA change');
    jar.set(trustedCookie,rememberedAgain);
    assert.equal((await (await login()).json()).mfa.stage,'verify','old trust revoked on 2FA change');
    assert.equal((await verify(codes[3])).ok,false,'old recovery codes revoked');
    assert.equal((await verify(replaced.recoveryCodes[0],true)).status,200);
    // Actual PIN-reset route must revoke all proofs without disabling 2FA.
    const beforeReset=jar.get(sessionCookie),beforeResetTrust=jar.get(trustedCookie);
    const resetToken='b'.repeat(64);
    await db.prepare('INSERT INTO pin_reset_tokens(player_id,token_hash,expires_at) VALUES(?,?,?)').bind(adminId,await sha256(resetToken),new Date(Date.now()+60000).toISOString()).run();
    assert.equal((await post({action:'reset_pin',token:resetToken,pin:'4567',confirmPin:'4567'})).status,200);
    jar.set(sessionCookie,beforeReset);assert.equal(await currentPlayer(),null);
    jar.set(trustedCookie,beforeResetTrust);
    await resetLimits();
    const afterReset=await (await post({action:'login',memberNo:'admin',pin:'4567'})).json();
    assert.equal(afterReset.mfa.stage,'verify');
    const challenged=jar.get(challengeCookie);
    await db.prepare('UPDATE mfa_challenges SET expires_at=0 WHERE token_hash=?').bind(await sha256(challenged)).run();
    assert.equal((await verify(replaced.recoveryCodes[1])).ok,false,'expired challenge rejected');
    await resetLimits();await post({action:'login',memberNo:'admin',pin:'4567'});
    // Even resetting per-account throttling cannot bypass a challenge's attempt limit.
    for(let i=0;i<8;i++)assert.equal((await verify('invalid')).ok,false);
    assert.equal((await verify(replaced.recoveryCodes[1])).ok,false,'attempt budget exhausted');
    await resetLimits();await post({action:'login',memberNo:'admin',pin:'4567'});
    const concurrent=await Promise.all([verify(replaced.recoveryCodes[1]),verify(replaced.recoveryCodes[1])]);
    assert.equal(concurrent.filter(r=>r.ok).length,1,'concurrent requests can consume a challenge and recovery code only once');
    assert.equal((await post({action:'logout_all'})).status,200);
    assert.equal((await db.prepare('SELECT count(*) n FROM trusted_devices WHERE player_id=?').bind(adminId).first()).n,0);
    assert.equal(await currentPlayer(),null);
    // MFA encryption configuration fails closed.
    delete globalThis.__sessionTest.env.MFA_ENCRYPTION_KEY;
    assert.equal((await login('otheradmin')).ok,false);
    assert.equal(await currentPlayer(),null);
    assert.ok(otherId);
  } finally {
    delete globalThis.__sessionTest;
    await proxy?.dispose();
    rmSync(folder,{recursive:true,force:true});
  }
});
