import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {scoreMatch} from '../lib/optimizer.ts';
import {defaultOptimizerPriorities} from '../lib/optimizer-priorities.ts';

test('durable optimization warns on member and signup edits, preserves current signups, and rejects plan conflicts',{timeout:120000},async()=>{
  const directory=mkdtempSync(join(process.cwd(),'.optimizer-jobs-test-'));
  const originalFetch=globalThis.fetch;
  let proxy;
  try {
    proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override,is_test,test_active) VALUES(100,'2030-06-12','2030-06-10','2030-06-11','closed',1,1)").run();
    for(let id=1;id<=4;id++){
      await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash,christin_ranking,birth_year) VALUES(?,?,?,'M','B','test',5,1980)").bind(id,String(id),`Player ${id}`).run();
      await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours) VALUES(100,?,'[\"18:00\",\"19:00\"]',1)").bind(id).run();
    }
    globalThis.__optimizerJobs={user:null,env:{DB:db,OPTIMIZER_URL:'https://optimizer.test',OPTIMIZER_API_KEY:'test-key'}};
    await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash,christin_ranking,birth_year) VALUES(5,'5','Late member','M','B','test',5,1980)").run();
    await db.batch(Array.from({length:215},(_,i)=>db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash,christin_ranking,birth_year) VALUES(?,?,?,'M','B','test',5,1980)").bind(i+6,String(i+6),`Synthetic ${i+6}`)));
    for(const [id,status,hours] of [[6,'waitlist',1],[7,'active',1],[8,'active',1],[9,'cancelled',1],[10,'active',0]])
      await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours,status) VALUES(100,?,'[\"18:00\",\"19:00\"]',?,?)").bind(id,hours,status).run();
    await db.prepare("UPDATE profile_privacy SET closed_at='2030-01-01' WHERE player_id=7").run();
    await db.prepare('UPDATE players SET suspended_event_id=100 WHERE id=8').run();
    globalThis.fetch=async(url,options)=>String(url)==='https://optimizer.test/jobs-health'?Response.json({jobProtocol:1}):originalFetch(url,options);
    const outfile=join(directory,'jobs.mjs');
    await build({stdin:{contents:`export {GET,POST} from './app/api/optimizer/jobs/route.ts'; export {finishOptimizerJob} from './lib/optimizer-job-core.ts'; export {runOptimizerJob,recoverJobs} from './optimizer-cloudflare/jobs.js';`,resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'job-context',setup(builder){
        builder.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({resolveDir:process.cwd(),contents:args.path==='auth'?'export const currentPlayer=async()=>globalThis.__optimizerJobs.user;':'export const getCloudflareContext=()=>({env:globalThis.__optimizerJobs.env});'}));
      }
    }]});
    const {GET,POST,finishOptimizerJob,runOptimizerJob,recoverJobs}=await import(pathToFileURL(outfile).href);
    const start=()=>POST(new Request('https://app.test/api/optimizer/jobs',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({eventId:100})}));
    const status=()=>GET(new Request('https://app.test/api/optimizer/jobs?eventId=100'));
    assert.equal((await start()).status,401);
    globalThis.__optimizerJobs.user={id:1,role:'player'};
    assert.equal((await start()).status,403);
    assert.equal((await status()).status,403);
    globalThis.__optimizerJobs.user={id:1,role:'admin'};
    const started=await start();
    assert.equal(started.status,202,JSON.stringify(await started.clone().json()));
    const first=(await started.json()).job;
    assert.equal((await (await start()).json()).job.id,first.id,'double click reuses durable job');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM optimizer_jobs').first()).n,1);
    const stored=await db.prepare('SELECT * FROM optimizer_jobs WHERE id=?').bind(first.id).first();
    const snapshot=JSON.parse(stored.snapshot);
    assert.deepEqual(snapshot.input.optimizerPriorities,defaultOptimizerPriorities);
    const nextPriorities=[...defaultOptimizerPriorities].reverse().map(p=>({...p,enabled:p.id!=='courts'}));
    await db.prepare("INSERT INTO optimizer_defaults(id,weights) VALUES(1,?) ON CONFLICT(id) DO UPDATE SET weights=json_patch(weights,excluded.weights)").bind(JSON.stringify({optimizerPriorities:nextPriorities})).run();
    assert.equal((await db.prepare('SELECT count(*) n FROM players').first()).n,220);
    assert.deepEqual(snapshot.input.players.map(p=>p.id).sort((a,b)=>a-b),[1,2,3,4,6],
      'only eligible active/waitlist signups enter automatic solving, even with over 200 profiles');
    assert.equal(snapshot.input.players.some(p=>p.manualCandidate),false);
    const plan=[{court:4,startTime:'18:00',team1:[1,2],team2:[3,4]}];
    const result={matches:plan,status:'OPTIMAL',score:scoreMatch(plan[0],snapshot.input,plan).score,priorityProtocol:1};
    let dispatched;
    await recoverJobs({DB:db,OPTIMIZER_JOBS:{create:async options=>{dispatched=options;}}});
    assert.equal(dispatched.id,first.id,'cron dispatches without a browser request');
    await db.prepare("UPDATE players SET christin_ranking=NULL,name='Changed member' WHERE id=1").run();
    globalThis.__optimizerJobs.user=null;
    const steps=[];
    const step={do:async(name,...args)=>{steps.push(name);return args.at(-1)();}};
    await runOptimizerJob({DB:db,OPTIMIZER_API_KEY:'test-key',OPTIMIZER:{getByName:()=>({fetch:async request=>{
      const input=await request.json();assert.equal(input.players[0].cr,5,'original member snapshot');
      assert.deepEqual(input.optimizerPriorities,defaultOptimizerPriorities,'running job retains original priorities');
      return Response.json(result);
    }})}},first.id,step);
    assert.deepEqual(steps,['calculate','save draft']);
    const saved=await db.prepare('SELECT * FROM optimizer_jobs WHERE id=?').bind(first.id).first();
    assert.equal(saved.status,'completed',saved.error);assert.match(saved.warning,/Medlemsoplysninger/);assert.equal(saved.snapshot,'');
    const event=await db.prepare('SELECT * FROM events WHERE id=100').first();
    assert.equal(event.status,'draft');assert.equal(event.published_at,null);
    assert.equal(JSON.parse(event.imported_kampplan)[0].D,'Player 1');
    assert.deepEqual(JSON.parse(event.imported_kampplan)[0]._optimizerPriorities,defaultOptimizerPriorities,'saved plan retains its priority audit');
    const matches=(await db.prepare('SELECT * FROM matches WHERE event_id=100').all()).results;
    await finishOptimizerJob(db,first.id,result);
    assert.deepEqual((await db.prepare('SELECT * FROM matches WHERE event_id=100').all()).results,matches,'repeat completion is idempotent');
    globalThis.__optimizerJobs.user={id:1,role:'admin'};
    const displayed=(await (await status()).json()).job;
    assert.equal(displayed.warning,saved.warning);assert.equal(displayed.summary.score,result.score);
    assert.equal(displayed.snapshot,undefined);
    await db.prepare('UPDATE players SET christin_ranking=5 WHERE id=1').run();
    const second=(await (await start()).json()).job;
    assert.deepEqual(JSON.parse((await db.prepare('SELECT snapshot FROM optimizer_jobs WHERE id=?').bind(second.id).first()).snapshot).input.optimizerPriorities,nextPriorities);
    await db.prepare("UPDATE signups SET requested_hours=2,availability='[\"19:00\",\"20:00\"]' WHERE player_id=1").run();
    await db.prepare("UPDATE signups SET status='cancelled' WHERE player_id=2").run();
    await db.prepare('DELETE FROM signups WHERE player_id=3').run();
    await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours,status) VALUES(100,5,'[\"18:00\",\"19:00\"]',1,'waitlist')").run();
    const changedSignups=(await db.prepare('SELECT * FROM signups ORDER BY id').all()).results;
    await finishOptimizerJob(db,second.id,result);
    const signupJob=(await (await status()).json()).job;
    assert.equal(signupJob.status,'completed');assert.match(signupJob.warning,/Tilmeldingerne/);assert.doesNotMatch(signupJob.warning,/Medlemsoplysninger/);
    assert.deepEqual((await db.prepare('SELECT * FROM signups ORDER BY id').all()).results,changedSignups,'saving a snapshot never overwrites newer signups');
    assert.deepEqual(JSON.parse((await db.prepare('SELECT player_ids FROM matches WHERE event_id=100').first()).player_ids),[1,2,3,4],'plan uses original signups');
    await db.prepare("UPDATE signups SET requested_hours=1,availability='[\"18:00\",\"19:00\"]',status='active' WHERE player_id IN (1,2)").run();
    await db.prepare('DELETE FROM signups WHERE player_id=5').run();
    await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours) VALUES(100,3,'[\"18:00\",\"19:00\"]',1)").run();
    await db.prepare("UPDATE events SET status='published',published_at='2030-06-01' WHERE id=100").run();
    const third=(await (await start()).json()).job;
    await finishOptimizerJob(db,third.id,result);
    const thirdJob=await db.prepare('SELECT * FROM optimizer_jobs WHERE id=?').bind(third.id).first();
    assert.equal(thirdJob.status,'completed');assert.equal(thirdJob.warning,'');
    assert.deepEqual(await db.prepare('SELECT status,published_at FROM events WHERE id=100').first(),{status:'draft',published_at:null});
    const fourth=(await (await start()).json()).job;
    const beforeRace=await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first();
    const racingDb=new Proxy(db,{get(target,property){
      if(property==='batch')return async statements=>{
        await db.prepare("UPDATE events SET status='published' WHERE id=100").run();
        return db.batch(statements);
      };
      const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
    }});
    await finishOptimizerJob(racingDb,fourth.id,result);
    assert.equal((await db.prepare('SELECT status FROM optimizer_jobs WHERE id=?').bind(fourth.id).first()).status,'failed');
    assert.deepEqual(await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first(),beforeRace,'concurrent publish cannot be overwritten');
    const fifth=(await (await start()).json()).job;
    await runOptimizerJob({DB:db,OPTIMIZER:{getByName:()=>({fetch:async()=>Response.json({error:'offline'},{status:503})})}},fifth.id,step);
    assert.equal((await db.prepare('SELECT status FROM optimizer_jobs WHERE id=?').bind(fifth.id).first()).status,'failed','exhausted workflow step persists failure');
    assert.match((await db.prepare('SELECT error FROM optimizer_jobs WHERE id=?').bind(fifth.id).first()).error,/HTTP 503.*offline/);
    const outdated=(await (await start()).json()).job;
    await runOptimizerJob({DB:db,OPTIMIZER:{getByName:()=>({fetch:async()=>Response.json({...result,priorityProtocol:undefined})})}},outdated.id,step);
    const outdatedJob=await db.prepare('SELECT status,error FROM optimizer_jobs WHERE id=?').bind(outdated.id).first();
    assert.equal(outdatedJob.status,'failed');assert.match(outdatedJob.error,/opdateres/,'old solver cannot silently ignore priorities');
    for(const response of [()=>Response.json({error:'Ugyldigt antal spillere, banetider eller historikrunder.'},{status:400}),()=>new Response('<html>Bad request</html>',{status:400})]) {
      const rejected=(await (await start()).json()).job;
      const before=await db.prepare('SELECT imported_kampplan,status FROM events WHERE id=100').first();
      let calls=0;
      const retryStep={do:async(_name,...args)=>{for(let attempt=0;;attempt++){try{return await args.at(-1)();}catch(e){if(attempt===2)throw e;}}}};
      await runOptimizerJob({DB:db,OPTIMIZER:{getByName:()=>({fetch:async()=>{calls++;return response();}})}},rejected.id,retryStep);
      const failed=await db.prepare('SELECT status,error,snapshot FROM optimizer_jobs WHERE id=?').bind(rejected.id).first();
      assert.equal(calls,1,'HTTP 400 is not retried');assert.equal(failed.status,'failed');assert.equal(failed.snapshot,'');
      assert.match(failed.error,/HTTP 400/);assert.doesNotMatch(failed.error,/<html>/);
      if(response().headers.get('content-type').includes('json'))assert.match(failed.error,/Ugyldigt antal spillere/);
      assert.deepEqual(await db.prepare('SELECT imported_kampplan,status FROM events WHERE id=100').first(),before);
      assert.equal((await (await status()).json()).job.error,failed.error,'specific error is visible to admin');
    }
    const sixth=(await (await start()).json()).job;
    const signupRaceDb=new Proxy(db,{get(target,property){
      if(property==='batch')return async statements=>{
        await db.prepare('UPDATE signups SET requested_hours=2 WHERE player_id=1').run();
        await db.prepare("UPDATE players SET name='Updated again' WHERE id=1").run();
        return db.batch(statements);
      };
      const value=Reflect.get(target,property);return typeof value==='function'?value.bind(target):value;
    }});
    await finishOptimizerJob(signupRaceDb,sixth.id,result);
    const combined=(await (await status()).json()).job;
    assert.equal(combined.status,'completed');assert.match(combined.warning,/Medlemsoplysninger/);assert.match(combined.warning,/Tilmeldingerne/);
    globalThis.fetch=async()=>Response.json({error:'old worker'},{status:404});
    assert.equal((await start()).status,503,'old deployment cannot accept undeliverable jobs');
  } finally {
    delete globalThis.__optimizerJobs;
    globalThis.fetch=originalFetch;
    await proxy?.dispose();rmSync(directory,{recursive:true,force:true});
  }
});
