import assert from 'node:assert/strict';
import test from 'node:test';
import {mkdtempSync,readdirSync,readFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {build} from 'esbuild';
import {getPlatformProxy} from 'wrangler';
import {migrationStatements} from '../scripts/migration-statements.mjs';
import {sql} from 'drizzle-orm';

test('club pair settings migrate, persist, restrict access and enter solver snapshots', {timeout:120000},async()=>{
 const folder=mkdtempSync(join(process.cwd(),'.optimizer-test-'));let proxy;
 try {
  proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(folder,'db')}});
  const db=proxy.env.DB;
  const migrate=async file=>db.batch(migrationStatements(readFileSync(join('drizzle',file),'utf8')).map(s=>db.prepare(s)));
  for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql') && !f.startsWith('0023')).sort())await migrate(file);
  for(const [id,no] of [[1,'17108'],[2,'13993'],[3,'other']])await db.prepare("INSERT INTO players(id,member_no,name,gender,self_level,pin_hash,role) VALUES(?,?,?,'M','B','test','admin')").bind(id,no,`Member ${id}`).run();
  await migrate('0023_forbidden_pairs.sql');
  globalThis.__pairsTest={user:{id:1,memberNo:'17108',role:'admin'},env:{DB:db,SUPERADMIN_PLAYER_ID:'1'}};
  const outfile=join(folder,'bundle.mjs');
  await build({stdin:{contents:"export * as app from './app/api/app/route'; export {loadOptimizerInput} from './lib/optimizer-server'; export {loadForbiddenPairs} from './lib/optimizer-defaults-server'; export {optimizerScheduleSql} from './lib/optimizer-revision'; export {getDb} from './db';",resolveDir:process.cwd()},outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'context',setup(b){
   b.onResolve({filter:/^next\/server$/},()=>({path:'next/server.js',external:true}));
   b.onResolve({filter:/^next\/headers$/},()=>({path:'headers',namespace:'test'}));
   b.onLoad({filter:/^headers$/,namespace:'test'},()=>({contents:'export const cookies=async()=>({get:()=>undefined});'}));
   b.onResolve({filter:/\/lib\/auth$/},()=>({path:'auth',namespace:'test'}));
   b.onResolve({filter:/^@opennextjs\/cloudflare$/},()=>({path:'env',namespace:'test'}));
   b.onLoad({filter:/.*/,namespace:'test'},a=>({resolveDir:process.cwd(),contents:a.path==='env'?'export const getCloudflareContext=()=>({env:globalThis.__pairsTest.env});':`export {hashPin,verifyPin,hashToken,verifyToken} from './lib/credentials'; export const currentPlayer=async()=>globalThis.__pairsTest.user; export const createSession=async()=>{}; export const destroySession=async()=>{}; export const destroyAllSessions=async()=>{};`}));
  }}]});
  const {app,loadOptimizerInput,loadForbiddenPairs,optimizerScheduleSql,getDb}=await import(pathToFileURL(outfile).href);
  const post=pairs=>app.POST(new Request('https://example.test/api/app',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'set_forbidden_pairs',pairs})}));
  assert.equal((await loadForbiddenPairs()).length,3,'legacy constraints migrated');
  globalThis.__pairsTest.user={id:2,role:'admin'};
  assert.equal((await post([])).status,403);
  globalThis.__pairsTest.user={id:3,role:'player'};
  assert.equal((await post([])).status,403);
  globalThis.__pairsTest.user=null;
  assert.equal((await post([])).status,401);
  globalThis.__pairsTest.user={id:1,memberNo:'17108',role:'admin'};
  for(const pairs of [[['17108','17108']],[['missing','other']],[['17108','other'],['other','17108']]])assert.equal((await post(pairs)).status,400);
  const before=await getDb().get(sql`SELECT ${optimizerScheduleSql()} AS revision`);
  const response=await post([['other','17108']]);
  assert.equal(response.status,200,await response.clone().text());
  const state=await response.json();
  assert.deepEqual(state.forbiddenMemberPairs,[['17108','other']]);
  assert.deepEqual((await loadOptimizerInput(state.event.id,{},true)).input.forbiddenMemberPairs,[['17108','other']]);
  assert.deepEqual(await loadForbiddenPairs(),[['17108','other']]);
  assert.notDeepEqual(await getDb().get(sql`SELECT ${optimizerScheduleSql()} AS revision`),before,'running jobs detect changed boundaries');
  assert.equal((await post([])).status,200);
  assert.deepEqual(await loadForbiddenPairs(),[],'removed pairs stay removed');
 } finally {delete globalThis.__pairsTest;await proxy?.dispose();rmSync(folder,{recursive:true,force:true});}
});
