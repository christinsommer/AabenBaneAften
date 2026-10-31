import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,readdirSync,rmSync} from 'node:fs';
import {join,resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';

test('member wishes remain editable after closure until planning, waitlist locks, publication unlocks, and stale writes fail',{timeout:120000},async()=>{
 const directory=mkdtempSync(join(process.cwd(),'.planning-test-'));let proxy;
 try {
  proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(directory,'db')}});const db=proxy.env.DB;
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
  for(let id=1;id<=4;id++)await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash) VALUES(?,?,?,'M','B','test')").bind(id,String(id),`Synthetic ${id}`).run();
  await db.prepare("INSERT INTO events(id,date,registration_opens_at,registration_closes_at,registration_override,is_test,test_active) VALUES(100,'2030-06-12','2020-06-10','2020-06-11','closed',1,1)").run();
  for(const [id,status] of [[1,'active'],[2,'waitlist']])await db.prepare("INSERT INTO signups(event_id,player_id,requested_hours,availability,status) VALUES(100,?,1,'[\"18:00\",\"19:00\"]',?)").bind(id,status).run();
  globalThis.__planning={env:{DB:db},user:{id:1,role:'player'}};
  const outfile=join(directory,'route.mjs');
  await build({entryPoints:['app/api/app/route.ts'],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'planning-context',setup(builder){
   builder.onResolve({filter:/^next\/(server|headers)$/},args=>({path:`${args.path}.js`,external:true}));
   builder.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
   builder.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'context',namespace:'test'}));
   builder.onLoad({filter:/.*/,namespace:'test'},args=>({resolveDir:process.cwd(),contents:args.path==='auth'
    ? `export * from ${JSON.stringify(resolve('lib/auth.ts'))}; export const currentPlayer=async()=>globalThis.__planning.user;`
    : 'export const getCloudflareContext=()=>({env:globalThis.__planning.env});'}));
  }}]});
  const {POST,GET}=await import(pathToFileURL(outfile).href);
  const wishes={eventId:100,nHours:1,nPossible:2,szPossible:['19:00','20:00']};
  const post=(action,extra={})=>POST(new Request('https://app.test/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...wishes,action,...extra})}));
  const signup=id=>db.prepare('SELECT * FROM signups WHERE event_id=100 AND player_id=?').bind(id).first();
  const flag=async()=>(await db.prepare('SELECT planning_in_progress AS flag FROM events WHERE id=100').first()).flag;
  for(const id of [1,2]) {
   globalThis.__planning.user={id,role:'player'};const before=await signup(id);
   const response=await post('signup');assert.equal(response.status,200,JSON.stringify(await response.clone().json()));
   const after=await signup(id);assert.equal(after.status,before.status);assert.equal(after.signup_order,before.signup_order);assert.equal(after.created_at,before.created_at);
   assert.deepEqual(JSON.parse(after.availability),wishes.szPossible);
  }
  globalThis.__planning.user={id:3,role:'player'};assert.equal((await post('signup')).status,400,'new active registration remains closed');
  assert.equal((await post('join_waitlist')).status,200,'late waitlist before planning');
  globalThis.__planning.user={id:2,role:'player'};assert.equal((await post('cancel_signup')).status,200);
  assert.equal((await signup(2)).status,'cancelled');assert.equal((await signup(2)).requested_hours,0);assert.equal((await signup(2)).availability,'[]');
  assert.equal((await post('signup')).status,400,'cancelled member cannot rejoin active queue after closure');
  assert.equal(await flag(),0);
  await db.prepare("INSERT INTO optimizer_jobs(id,event_id,status,snapshot,created_at) VALUES('test-job',100,'queued','{}','2030-06-11')").run();
  assert.equal(await flag(),1);
  const state=await (await GET()).json();assert.equal(state.event.planningInProgress,true);assert.equal(state.isOpen,false);
  for(const id of [1,2,3,4]) {
   globalThis.__planning.user={id,role:'player'};const before=await signup(id);
   for(const action of ['signup','cancel_signup','join_waitlist'])assert.equal((await post(action)).status,400);
   assert.deepEqual(await signup(id),before,'planning prevents all member mutations');
  }
  globalThis.__planning.user={id:1,role:'admin'};
  assert.equal((await post('set_signup_status',{signupId:(await signup(1)).id,status:'waitlist'})).status,409);
  assert.equal((await post('set_registration',{mode:'open'})).status,200);
  assert.equal((await post('signup')).status,400,'manual open does not bypass planning lock');
  await post('set_registration',{mode:'closed'});
  assert.equal((await post('publish')).status,200);assert.equal(await flag(),0);
  globalThis.__planning.user={id:4,role:'player'};assert.equal((await post('join_waitlist')).status,200,'publication restores normal late waitlist');
  globalThis.__planning.user={id:1,role:'player'};assert.equal((await post('signup')).status,400,'publication does not reopen active wishes');
  await db.prepare("UPDATE events SET status='draft' WHERE id=100").run();
  // Simulate job creation after the API reads the event, just before its write.
  let raced=false;
  globalThis.__planning.env.DB=new Proxy(db,{get(target,key){
   if(key==='prepare')return query=>{
    const wrap=statement=>new Proxy(statement,{get(stmt,method){
     if(method==='bind')return(...args)=>wrap(stmt.bind(...args));
     if(['all','run','raw'].includes(method))return async(...args)=>{
      if(!raced&&/^(update ["`]?signups|INSERT INTO signups)/i.test(query.trim())){raced=true;await db.prepare('UPDATE events SET planning_in_progress=1 WHERE id=100').run();}
      return stmt[method](...args);
     };
     const value=Reflect.get(stmt,method);return typeof value==='function'?value.bind(stmt):value;
    }});return wrap(target.prepare(query));
   };
   const value=Reflect.get(target,key);return typeof value==='function'?value.bind(target):value;
  }});
  const before=await signup(1);assert.equal((await post('signup',{szPossible:['18:00','19:00']})).status,409);
  assert.equal(raced,true);assert.deepEqual(await signup(1),before);
 } finally {delete globalThis.__planning;await proxy?.dispose();rmSync(directory,{recursive:true,force:true});}
});
