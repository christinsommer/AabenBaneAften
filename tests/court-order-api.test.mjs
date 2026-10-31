import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {defaultOptimizerPriorities} from '../lib/optimizer-priorities.ts';

test('admin court orders persist independently of factor defaults and reject unauthorized or invalid changes',{timeout:120000},async()=>{
  const directory=mkdtempSync(join(process.cwd(),'.court-order-test-'));
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    globalThis.__courtOrderTest={env:{DB:db,SUPERADMIN_PLAYER_ID:'1'},user:null};
    const outfile=join(directory,'route.mjs');
    await build({entryPoints:['app/api/app/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'court-test-context',setup(builder){
        builder.onResolve({filter:/^next\/(server|headers)$/},args=>({path:`${args.path}.js`,external:true}));
        builder.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({resolveDir:process.cwd(),contents:args.path==='auth'
          ? `export * from ${JSON.stringify(resolve('lib/auth.ts'))}; export const currentPlayer=async()=>globalThis.__courtOrderTest.user;`
          : 'export const getCloudflareContext=()=>({env:globalThis.__courtOrderTest.env});'}));
      }
    }]});
    const {POST,GET}=await import(pathToFileURL(outfile).href);
    const post=body=>POST(new Request('https://app.test/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)}));
    const courtOrder={whole:[2,4,1,3],half:[7,5,6]};
    const optimizerPriorities=[...defaultOptimizerPriorities].reverse().map(p=>({...p,enabled:p.id!=='score'}));
    assert.equal((await post({action:'set_optimizer_priorities',optimizerPriorities})).status,401);
    assert.equal((await post({action:'set_court_order',courtOrder})).status,401);
    globalThis.__courtOrderTest.user={id:1,role:'player'};
    assert.equal((await post({action:'set_optimizer_priorities',optimizerPriorities})).status,403);
    assert.equal((await post({action:'set_optimizer_resources',optimizerResources:{cpu:2,seconds:30}})).status,403);
    assert.equal((await post({action:'set_court_order',courtOrder})).status,403);
    globalThis.__courtOrderTest.user={id:2,role:'admin'};
    assert.equal((await post({action:'set_optimizer_priorities',optimizerPriorities})).status,403);
    assert.equal((await (await GET()).json()).optimizerPriorities,undefined);
    assert.equal((await (await GET()).json()).optimizerResources,undefined);
    assert.equal((await post({action:'set_optimizer_resources',optimizerResources:{cpu:2,seconds:30}})).status,403);
    assert.equal((await post({action:'set_optimizer_defaults',weights:{FactorOpponentThisWeek:17}})).status,403);
    assert.equal((await post({action:'set_court_order',courtOrder})).status,200);
    assert.equal((await post({action:'set_court_order',courtOrder:{whole:[4,3,2,1],half:[5,6,7]}})).status,200);
    globalThis.__courtOrderTest.user={id:1,role:'admin'};
    assert.deepEqual((await (await GET()).json()).optimizerPriorities,defaultOptimizerPriorities);
    assert.equal((await post({action:'set_optimizer_priorities',optimizerPriorities:[]})).status,400);
    assert.equal((await post({action:'set_optimizer_priorities',optimizerPriorities})).status,200);
    assert.deepEqual((await (await GET()).json()).optimizerResources,{cpu:4,seconds:600});
    for(const optimizerResources of [{cpu:0,seconds:600},{cpu:33,seconds:600},{cpu:2.5,seconds:600},{cpu:4,seconds:0},{cpu:4,seconds:901},{cpu:4,seconds:null}])
      assert.equal((await post({action:'set_optimizer_resources',optimizerResources})).status,400);
    const maximumReply=await post({action:'set_optimizer_resources',optimizerResources:{cpu:4,seconds:900}});
    assert.equal(maximumReply.status,200);
    assert.deepEqual((await maximumReply.json()).optimizerResources,{cpu:4,seconds:900});
    assert.equal((await post({action:'set_optimizer_resources',optimizerResources:{cpu:2,seconds:30}})).status,200);
    assert.deepEqual((await (await GET()).json()).courtOrder,{whole:[4,3,2,1],half:[5,6,7]});
    assert.equal((await post({action:'set_court_order',courtOrder:{whole:[1,1,2,3],half:[5,6,7]}})).status,400);
    assert.equal((await post({action:'set_court_order',courtOrder})).status,200);
    const weightsReply=await post({action:'set_optimizer_defaults',weights:{FactorOpponentThisWeek:17}});
    assert.equal(weightsReply.status,200);
    assert.deepEqual((await weightsReply.json()).courtOrder,courtOrder);
    courtOrder.whole=[1,3,2,4];
    assert.equal((await post({action:'set_court_order',courtOrder})).status,200);
    const state=await (await GET()).json();
    assert.deepEqual(state.courtOrder,courtOrder);
    assert.equal(state.optimizerDefaults.FactorOpponentThisWeek,17);
    assert.deepEqual(state.optimizerResources,{cpu:2,seconds:30});
    assert.deepEqual(state.optimizerPriorities,optimizerPriorities,'other settings preserve priorities');
    const summerCourts={whole:[12,8],half:[10]};
    assert.equal((await post({action:'set_court_order',courtOrder:summerCourts})).status,200);
    const playTimes={whole:['18:00','19:00'],half:['17:30','18:30']};
    assert.equal((await post({action:'set_play_times',playTimes:{...playTimes,whole:['18:30']}})).status,400);
    assert.equal((await post({action:'set_play_times',playTimes})).status,200);
    const summer=await (await GET()).json();
    assert.deepEqual(summer.times,['17:30','18:00','18:30','19:00']);
    assert.deepEqual(summer.courtOrder,summerCourts);
    assert.deepEqual(summer.timeGroups,playTimes);
    assert.equal(summer.optimizerDefaults.FactorOpponentThisWeek,17);
    globalThis.__courtOrderTest.user={id:1,role:'player'};
    assert.equal((await post({action:'set_play_times',playTimes})).status,403);
    assert.deepEqual((await (await GET()).json()).times,summer.times);
    await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash) VALUES(1,'summer-member','Summer Member','M','B','test')").run();
    await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override,is_test,test_active) VALUES(100,'2030-06-12','2030-06-10','2030-06-11','open',1,1)").run();
    const signup=await post({action:'signup',nHours:1,nPossible:2,szPossible:['17:30','18:00']});
    assert.equal(signup.status,200);
    assert.deepEqual((await signup.json()).signup.szPossible,['17:30','18:00']);
    assert.equal((await post({action:'signup',nHours:1,nPossible:2,szPossible:['17:30','20:30']})).status,400);
    globalThis.__courtOrderTest.user={id:2,role:'admin'};
    const emptyGroup=await post({action:'set_play_times',playTimes:{whole:[],half:['17:30','18:30']}});
    assert.equal(emptyGroup.status,200);
    assert.deepEqual((await emptyGroup.json()).times,['17:30','18:30']);
  } finally {
    delete globalThis.__courtOrderTest;
    await proxy?.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
