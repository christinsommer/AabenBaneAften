import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';

test('admin edits current signup wishes after closing registration, preserving status and queue; stale, invalid and unauthorized edits fail',{timeout:120000},async()=>{
  const directory=mkdtempSync(join(process.cwd(),'.admin-signup-test-'));
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash) VALUES(1,'member','Member','M','B','test')").run();
    await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override,is_test,test_active) VALUES(100,'2030-06-12','2030-06-10','2030-06-11','closed',1,1)").run();
    await db.prepare("INSERT INTO signups(id,event_id,player_id,requested_hours,availability,status) VALUES(1,100,1,1,'[\"18:00\",\"19:00\"]','waitlist')").run();
    globalThis.__adminSignupTest={env:{DB:db},user:null};
    const outfile=join(directory,'route.mjs');
    await build({entryPoints:['app/api/app/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'admin-signup-context',setup(builder){
        builder.onResolve({filter:/^next\/(server|headers)$/},args=>({path:`${args.path}.js`,external:true}));
        builder.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({resolveDir:process.cwd(),contents:args.path==='auth'
          ? `export * from ${JSON.stringify(resolve('lib/auth.ts'))}; export const currentPlayer=async()=>globalThis.__adminSignupTest.user;`
          : 'export const getCloudflareContext=()=>({env:globalThis.__adminSignupTest.env});'}));
      }
    }]});
    const {POST}=await import(pathToFileURL(outfile).href);
    const read=()=>db.prepare('SELECT * FROM signups WHERE id=1').first();
    const original=await read();
    const payload={action:'admin_update_signup',eventId:100,signupId:1,nHours:2,nPossible:3,szPossible:['18:00','18:30','19:00'],
      expected:{requestedHours:1,availability:original.availability,status:'waitlist'}};
    const post=(extra={})=>POST(new Request('https://app.test/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...payload,...extra})}));
    assert.equal((await post()).status,401);
    globalThis.__adminSignupTest.user={id:1,role:'player'};
    assert.equal((await post()).status,403);
    globalThis.__adminSignupTest.user={id:1,role:'admin'};
    assert.equal((await post({eventId:99})).status,409);
    assert.equal((await post({signupId:99})).status,404);
    assert.equal((await post({szPossible:['17:00','18:00'],nPossible:2})).status,400);
    assert.equal((await post({szPossible:['18:00','18:30'],nPossible:2})).status,400);
    assert.equal((await post({nHours:0})).status,400);
    assert.deepEqual(await read(),original);
    const response=await post();
    assert.equal(response.status,200,JSON.stringify(await response.json()));
    const updated=await read();
    assert.equal(updated.requested_hours,2);
    assert.deepEqual(JSON.parse(updated.availability),payload.szPossible);
    assert.equal(updated.status,'waitlist');
    assert.equal(updated.signup_order,original.signup_order);
    assert.equal(updated.created_at,original.created_at);
    assert.equal((await post()).status,409,'stale popup must not overwrite new wishes');
    payload.expected={requestedHours:2,availability:updated.availability,status:updated.status};
    await db.prepare("UPDATE events SET status='published' WHERE id=100").run();
    const publishedResponse=await post({nHours:1});
    assert.equal(publishedResponse.status,200,JSON.stringify(await publishedResponse.json()));
    assert.deepEqual(await read(),{...updated,requested_hours:1});
    globalThis.__adminSignupTest.user={id:1,role:'player'};
    await db.prepare("UPDATE events SET registration_closes_at='2020-01-01',status='draft' WHERE id=100").run();
    await db.prepare("UPDATE signups SET status='active' WHERE id=1").run();
    const activeSignup=await read();
    for (const mode of ['closed','auto']) {
      await db.prepare('UPDATE events SET registration_override=? WHERE id=100').bind(mode).run();
      for (const action of ['join_waitlist','cancel_signup']) {
        assert.equal((await post({action})).status,400,`${action} must fail when registration is ${mode}`);
        assert.deepEqual(await read(),activeSignup);
      }
    }
    await db.prepare("UPDATE signups SET status='cancelled' WHERE id=1").run();
    assert.equal((await post({action:'join_waitlist'})).status,200,'members without an active signup can still join the waitlist');
    assert.equal((await read()).status,'waitlist');
    assert.equal((await post({action:'set_signup_status',status:'cancelled'})).status,403);
    globalThis.__adminSignupTest.user={id:1,role:'admin'};
    await db.prepare("UPDATE events SET registration_override='closed' WHERE id=100").run();
    for (const status of ['active','waitlist','cancelled']) {
      assert.equal((await post({action:'set_signup_status',status})).status,200,`admin can set ${status} after closing`);
      assert.equal((await read()).status,status);
    }
  } finally {
    delete globalThis.__adminSignupTest;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
