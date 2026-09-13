import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';
import { migrationStatements } from '../scripts/migration-statements.mjs';
import { hashPin, hashToken, verifyPin } from '../lib/credentials.ts';

test('anonymous reset request sends a usable, expiring, single-use PIN link', {timeout:120000}, async () => {
  const directory=mkdtempSync(join(process.cwd(),'.reset-test-'));
  const originalFetch=globalThis.fetch;
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort()) {
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    }
    await db.prepare('INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES(?,?,?,?,?,?)')
      .bind('reset-member','Reset Test','member@example.com','K','B',await hashPin('1234')).run();
    const {id}=await db.prepare('SELECT id FROM players WHERE member_no=?').bind('reset-member').first();
    globalThis.__resetTestEnv={DB:db,RESEND_API_KEY:'test-key'};
    const outfile=join(directory,'route.mjs');
    await build({entryPoints:['app/api/app/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'test-cloudflare-context',setup(builder){
        builder.onResolve({filter:/^next\/(server|headers)$/},args=>({path:`${args.path}.js`,external:true}));
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export const getCloudflareContext=()=>({env:globalThis.__resetTestEnv});'}));
      }
    }]});
    const {POST}=await import(pathToFileURL(outfile).href);
    const post=body=>POST(new Request('https://untrusted.example/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    const messages=[];
    let mailFails=false;
    globalThis.fetch=async(url,options)=>{
      if(String(url)!=='https://api.resend.com/emails')return originalFetch(url,options);
      assert.equal(options.headers.Authorization,'Bearer test-key');
      messages.push(JSON.parse(options.body));
      return new Response('{}',{status:mailFails?503:200});
    };
    assert.equal((await post({action:'request_pin_reset',memberNo:''})).status,400);
    assert.equal((await post({action:'request_pin_reset',memberNo:'unknown'})).status,200);
    assert.equal(messages.length,0);
    const requestLink=()=>post({action:'request_pin_reset',memberNo:' reset-member '});
    assert.equal((await requestLink()).status,200);
    assert.deepEqual(messages[0].to,['member@example.com']);
    const link=messages[0].text.match(/https:\/\/\S+/)[0];
    assert.equal(new URL(link).origin,'https://aabenbaneaften.dk');
    assert.ok(messages[0].html.includes(link));
    const token=new URL(link).searchParams.get('reset');
    const stored=await db.prepare('SELECT * FROM pin_reset_tokens WHERE player_id=?').bind(id).first();
    assert.equal(stored.token_hash,await hashToken(token));
    assert.notEqual(stored.token_hash,token);
    assert.ok(Date.parse(stored.expires_at)>Date.now());
    assert.ok(Date.parse(stored.expires_at)<=Date.now()+30*60*1000);
    const reset=(pin='5678',confirmPin=pin,t=token)=>post({action:'reset_pin',token:t,pin,confirmPin});
    assert.equal((await reset('123')).status,400);
    assert.equal((await reset('abcd')).status,400);
    assert.equal((await reset('5678','8765')).status,400);
    assert.equal((await reset('5678','5678','a'.repeat(64))).status,400);
    await db.prepare('UPDATE pin_reset_tokens SET expires_at=?').bind('2000-01-01T00:00:00.000Z').run();
    assert.equal((await reset()).status,400);
    await db.prepare('UPDATE pin_reset_tokens SET expires_at=?').bind(new Date(Date.now()+60000).toISOString()).run();
    // A failed delivery must not destroy a previously delivered link.
    mailFails=true;
    assert.equal((await requestLink()).status,502);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM pin_reset_tokens').first()).n,1);
    mailFails=false;
    assert.equal((await requestLink()).status,200);
    await db.prepare('INSERT INTO sessions(token_hash,player_id,expires_at) VALUES(?,?,?)').bind('old-session',id,'2099-01-01').run();
    const results=await Promise.all([reset(),reset()]);
    assert.deepEqual(results.map(r=>r.status).sort(),[200,400]);
    const player=await db.prepare('SELECT pin_hash FROM players WHERE id=?').bind(id).first();
    assert.equal(await verifyPin('5678',player.pin_hash),true);
    assert.equal(await verifyPin('1234',player.pin_hash),false);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sessions WHERE player_id=?').bind(id).first()).n,0);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM pin_reset_tokens WHERE player_id=?').bind(id).first()).n,0);
    assert.equal((await reset()).status,400);
    globalThis.__resetTestEnv.RESEND_API_KEY='';
    assert.equal((await requestLink()).status,502);
    assert.equal((await db.prepare('SELECT count(*) AS n FROM pin_reset_tokens').first()).n,0);
  } finally {
    globalThis.fetch=originalFetch;
    delete globalThis.__resetTestEnv;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
