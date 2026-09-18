import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, readFileSync, readdirSync, rmSync, existsSync} from 'node:fs';
import {join, resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawn} from 'node:child_process';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {algorithmWeightDefaults} from '../lib/optimizer.ts';

test('real CP-SAT service and D1: permissions, closed registration, history, validation, preview and atomic draft save', {timeout:180000}, async () => {
  const dll = resolve('optimizer-service/bin/Debug/net10.0/OptimizerService.dll');
  assert.ok(existsSync(dll), 'Build optimizer-service/OptimizerService.csproj before running integration tests');
  const directory = mkdtempSync(join(process.cwd(), '.optimizer-test-'));
  const key = 'test-only-optimizer-secret-32-characters';
  const service = spawn('dotnet',[dll,'--urls','http://127.0.0.1:0'],{env:{...process.env,OPTIMIZER_API_KEY:key},windowsHide:true,stdio:['ignore','pipe','pipe']});
  const originalFetch = globalThis.fetch;
  let proxy;
  try {
    const serviceUrl = await new Promise((resolveUrl,reject) => {
      let output = '';
      const timeout = setTimeout(()=>reject(new Error(`Service did not start: ${output}`)),20000);
      service.once('error',e=>{clearTimeout(timeout);reject(e);});
      service.once('exit',code=>{clearTimeout(timeout);reject(new Error(`Service exited ${code}: ${output}`));});
      const onData = data => {output += data; const match=output.match(/Now listening on: (http:\/\/127\.0\.0\.1:\d+)/);if(match){clearTimeout(timeout);resolveUrl(match[1]);}};
      service.stdout.on('data',onData); service.stderr.on('data',onData);
    });
    assert.equal((await originalFetch(serviceUrl+'/health')).status,200);
    assert.equal((await originalFetch(serviceUrl+'/solve',{method:'POST',headers:{'Content-Type':'application/json'},body:'{}'})).status,401);
    proxy = await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});
    const db=proxy.env.DB;
    for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())
      await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
    await db.prepare('DELETE FROM events').run();
    await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override) VALUES(100,'2026-10-16','2026-10-14','2026-10-15','closed')").run();
    for(let id=1;id<=4;id++) {
      await db.prepare("INSERT INTO players(id,member_no,name,first_name,last_name,gender,self_level,pin_hash,christin_ranking,birth_year) VALUES(?,?,?,?,'Test','M','B','test',5,1986)").bind(id,String(id),`Player ${id} Test`,`Player ${id}`).run();
      await db.prepare("INSERT INTO signups(event_id,player_id,availability,requested_hours) VALUES(100,?,'[\"18:00\",\"19:00\"]',1)").bind(id).run();
    }
    for(const [id,date] of [[1,'2026-09-11'],[2,'2026-09-18'],[3,'2026-09-25'],[4,'2026-10-02'],[5,'2026-10-09']]) {
      await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,status) VALUES(?,?,?,?,'published')").bind(id,date,date,date).run();
      await db.prepare("INSERT INTO matches(event_id,court,start_time,player_ids) VALUES(?,1,'18:00','[1,2,3,4]')").bind(id).run();
    }
    globalThis.__optimizerTest={user:{id:1,role:'admin'},env:{DB:db,OPTIMIZER_URL:'https://optimizer.test',OPTIMIZER_API_KEY:key}};
    const outfile=join(directory,'route.mjs');
    await build({entryPoints:['app/api/optimizer/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{
      name:'optimizer-test-context',setup(builder) {
        builder.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
        builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
        builder.onResolve({filter:/\/calendar(?:\.ts)?$/},()=>({path:'calendar',namespace:'test'}));
        builder.onLoad({filter:/.*/,namespace:'test'},args=>({contents:args.path==='auth'?'export const currentPlayer=async()=>globalThis.__optimizerTest.user;':args.path==='calendar'?"export const copenhagenDate=()=> '2026-10-16';":'export const getCloudflareContext=()=>({env:globalThis.__optimizerTest.env});'}));
      }
    }]});
    const {POST}=await import(pathToFileURL(outfile).href);
    let sent, tamperScore=false, duringSolve=null, unavailable=false;
    globalThis.fetch=async(url,options)=>{
      if(new URL(url).hostname!=='optimizer.test') return originalFetch(url,options);
      if(unavailable) throw new TypeError('fetch failed');
      sent=JSON.parse(options.body);
      const reply=await originalFetch(serviceUrl+'/solve',options);
      if(duringSolve) await duringSolve();
      if(tamperScore) {const data=await reply.json();return Response.json({...data,score:data.score+1});}
      return reply;
    };
    const post=(action='solve',extra={})=>POST(new Request('https://app.test/api/optimizer',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action,eventId:100,weights:algorithmWeightDefaults,...extra})}));
    globalThis.__optimizerTest.user=null;
    assert.equal((await post()).status,401);
    globalThis.__optimizerTest.user={id:1,role:'player'};
    assert.equal((await post()).status,403);
    globalThis.__optimizerTest.user={id:1,role:'admin'};
    await db.prepare("UPDATE events SET registration_override='open' WHERE id=100").run();
    assert.equal((await post()).status,400);
    await db.prepare("UPDATE events SET registration_override='closed' WHERE id=100").run();
    await db.prepare('UPDATE players SET christin_ranking=NULL WHERE id=1').run();
    assert.match((await (await post()).json()).error,/CR/);
    await db.prepare('UPDATE players SET christin_ranking=5 WHERE id=1').run();
    const response=await post();
    const proposal=await response.json();
    assert.equal(response.status,200,JSON.stringify(proposal));
    assert.deepEqual(proposal.historyDates,['2026-10-09','2026-10-02','2026-09-25']);
    assert.equal(sent.players[0].age,40);
    assert.equal(sent.players[0].name,undefined);
    assert.equal(sent.players[0].email,undefined);
    unavailable=true;
    const offline=await post();
    assert.equal(offline.status,503);
    assert.match((await offline.json()).error,/kan ikke kontaktes/);
    unavailable=false;
    assert.ok(proposal.matches.length);
    assert.equal((await db.prepare('SELECT count(*) as n FROM matches WHERE event_id=100').first()).n,0,'preview must not mutate schedule');
    assert.equal((await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first()).imported_kampplan,'');
    const invalid=structuredClone(proposal.matches); invalid[0].team2[0]=invalid[0].team1[0];
    assert.equal((await post('save',{matches:invalid,fingerprint:proposal.fingerprint})).status,400);
    await db.prepare('UPDATE players SET birth_year=1985 WHERE id=1').run();
    assert.equal((await post('save',{matches:proposal.matches,fingerprint:proposal.fingerprint})).status,409);
    await db.prepare('UPDATE players SET birth_year=1986 WHERE id=1').run();
    globalThis.__optimizerTest.env.DB = new Proxy(db, {get(target, property) {
      if (property === 'batch') return async statements => {
        await db.prepare('UPDATE players SET birth_year=1983 WHERE id=1').run();
        return db.batch(statements);
      };
      const value = Reflect.get(target, property);
      return typeof value === 'function' ? value.bind(target) : value;
    }});
    const race = await post('save',{matches:proposal.matches,fingerprint:proposal.fingerprint});
    assert.equal(race.status,409,'a write between final read and batch must prevent all schedule mutations');
    assert.equal((await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first()).imported_kampplan,'');
    assert.equal((await db.prepare('SELECT count(*) as n FROM matches WHERE event_id=100').first()).n,0);
    globalThis.__optimizerTest.env.DB=db;
    await db.prepare('UPDATE players SET birth_year=1986 WHERE id=1').run();
    const saved=await post('save',{matches:proposal.matches,fingerprint:proposal.fingerprint});
    assert.equal(saved.status,200,JSON.stringify(await saved.json()));
    const event=await db.prepare('SELECT * FROM events WHERE id=100').first();
    assert.equal(event.status,'draft'); assert.equal(event.published_at,null);
    assert.ok(JSON.parse(event.imported_kampplan)[0]._optimizerRevision);
    const savedRows=JSON.parse(event.imported_kampplan);
    assert.deepEqual(savedRows[0]._optimizerWeights,proposal.weights,'used weights survive saving and refresh');
    assert.equal(savedRows.reduce((total,row)=>total+row._optimizerScore,0),proposal.score,'per-match scores are stored with the saved plan');
    assert.equal((await db.prepare('SELECT count(*) as n FROM matches WHERE event_id=100').first()).n,proposal.matches.length);
    assert.equal((await post('save',{matches:proposal.matches,fingerprint:proposal.fingerprint})).status,409,'saving a stale preview twice must fail');
    const contextReply=await post('edit_context');
    assert.equal(contextReply.status,200);
    const edit=await contextReply.json();
    assert.equal(edit.players.length,4);
    const edited=structuredClone(edit.matches);
    [edited[0].team1[0],edited[0].team2[0]]=[edited[0].team2[0],edited[0].team1[0]];
    const editedBad=structuredClone(edited);editedBad[0].team2[0]=editedBad[0].team1[0];
    const failedReview=await post('review_edit',{matches:editedBad,fingerprint:edit.fingerprint});
    assert.equal(failedReview.status,200);
    const invalidReview=await failedReview.json();assert.equal(invalidReview.valid,false);
    assert.ok(invalidReview.issues.some(i=>i.playerIds.includes(editedBad[0].team1[0])));
    assert.equal((await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first()).imported_kampplan,event.imported_kampplan,'review never saves invalid edits');
    assert.equal((await post('save',{matches:editedBad,fingerprint:edit.fingerprint})).status,400);
    const goodReview=await (await post('review_edit',{matches:edited,fingerprint:edit.fingerprint})).json();
    assert.equal(goodReview.valid,true);
    assert.equal((await post('save',{matches:edited,fingerprint:edit.fingerprint})).status,200);
    const editedStored=JSON.parse((await db.prepare('SELECT imported_kampplan FROM events WHERE id=100').first()).imported_kampplan);
    assert.equal(editedStored[0]._optimizerScore,goodReview.scores[0]);
    assert.equal((await post('review_edit',{matches:edited,fingerprint:edit.fingerprint})).status,409,'stale manual edit must be rejected');
    tamperScore=true;
    assert.match((await (await post()).json()).error,/score/);
    tamperScore=false;
    duringSolve=()=>db.prepare('UPDATE players SET birth_year=1984 WHERE id=1').run();
    assert.equal((await post()).status,409,'edits during solve invalidate proposal');
    duringSolve=null;
    await db.prepare('UPDATE players SET birth_year=NULL WHERE id=1').run();
    assert.match((await (await post('solve',{weights:{...algorithmWeightDefaults,FactorAge:1}})).json()).error,/Alder/);
    await db.prepare("UPDATE events SET status='published' WHERE id=100").run();
    assert.equal((await post()).status,400,'must not overwrite published schedule');
    await db.prepare("UPDATE events SET status='draft' WHERE id IN (3,4,5,100)").run();
    const onlyBoundary=await (await post()).json();
    assert.deepEqual(onlyBoundary.historyDates,['2026-09-18'],'cutoff inclusive, previous September 11 excluded');
    const imported = [{A:'18:00',B:'19:00',C:'1',D:'Player 1 Test',E:'Player 2 Test',F:'Player 3 Test',G:'Player 4 Test'}];
    await db.prepare('UPDATE events SET imported_kampplan=? WHERE id=2').bind(JSON.stringify(imported)).run();
    assert.equal((await post()).status,200,'resolve full names in legacy Excel history');
    imported[0].D='Unknown member';
    await db.prepare('UPDATE events SET imported_kampplan=? WHERE id=2').bind(JSON.stringify(imported)).run();
    assert.match((await (await post()).json()).error,/entydigt/);
  } finally {
    globalThis.fetch=originalFetch;
    delete globalThis.__optimizerTest;
    service.kill();
    if(proxy) await proxy.dispose();
    rmSync(directory,{recursive:true,force:true});
  }
});
