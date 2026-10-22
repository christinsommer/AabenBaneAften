import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';

test('member spouse lookup and profile enforce privacy and simultaneous play',{timeout:120000},async()=>{
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
    await db.prepare("UPDATE players SET member_no='101',name='Test Member',first_name='Test',last_name='Member',email='test@example.com' WHERE id=1").run();
    await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash) VALUES(2,'202','Anna Jensen','K','B','test'),(3,'303','Anna Closed','K','B','test')").run();
    await db.prepare("UPDATE profile_privacy SET closed_at='2026-01-01' WHERE player_id=3").run();
    const post=body=>POST(new Request('https://app.test/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    const lookup=query=>post({action:'lookup_spouse',query});
    assert.equal((await lookup('Anna')).status,401);
    const refresh=async()=>{
      const row=await db.prepare('SELECT * FROM players WHERE id=1').first();
      globalThis.__adminSignupTest.user=Object.fromEntries(Object.entries(row).map(([k,v])=>[k.replace(/_([a-z])/g,(_,c)=>c.toUpperCase()),v]));
    };
    await refresh();
    for(const query of ['', 'An', 'A 12'])assert.deepEqual((await (await lookup(query)).json()).members,[]);
    assert.deepEqual((await (await lookup('ANNA')).json()).members,[{id:2,name:'Anna Jensen'}]);
    assert.deepEqual((await (await lookup('Test')).json()).members,[]);
    const profile={action:'update_profile',firstName:'Test',lastName:'Member',email:'test@example.com',level:'B',gender:'M'};
    for(const extra of [{spouseMode:2},{spouseNo:202}])assert.equal((await post({...profile,...extra})).status,403);
    for(const spousePlayerId of [1,3,999,'202'])assert.equal((await post({...profile,spousePlayerId})).status,400);
    const save=await post({...profile,spousePlayerId:2});
    assert.equal(save.status,200,JSON.stringify(await save.json()));
    const read=()=>db.prepare('SELECT spouse_no,spouse_mode FROM players WHERE id=1').first();
    assert.deepEqual(await read(),{spouse_no:202,spouse_mode:1});
    await db.prepare('UPDATE players SET spouse_mode=2 WHERE id=1').run();
    await refresh();
    const preserved=await post(profile);
    assert.equal(preserved.status,200);
    const state=await preserved.json();
    assert.deepEqual(state.user.spouse,{id:2,name:'Anna Jensen'});
    assert.equal(state.user.spouseNo,undefined);
    assert.equal(state.user.spouseMode,undefined);
    assert.deepEqual(await read(),{spouse_no:202,spouse_mode:2});
    assert.equal((await post({...profile,spousePlayerId:null})).status,200);
    assert.deepEqual(await read(),{spouse_no:null,spouse_mode:null});
  } finally {
    delete globalThis.__adminSignupTest;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
