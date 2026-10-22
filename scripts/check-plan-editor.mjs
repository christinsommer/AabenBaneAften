// Isolated browser check. No real accounts, database or production requests.
import {build} from 'esbuild';
import {createServer} from 'node:http';
import {spawn} from 'node:child_process';
import {mkdirSync, mkdtempSync, existsSync} from 'node:fs';
import {resolve, join} from 'node:path';
import assert from 'node:assert/strict';

const edge = 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe';
if (!existsSync(edge)) throw new Error('This browser check requires Microsoft Edge on Windows.');
mkdirSync('work', {recursive:true});
const profile=mkdtempSync(resolve('work/plan-editor-browser-'));
const bundle=await build({stdin:{resolveDir:process.cwd(),loader:'tsx',contents:`
import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import {PlanEditor} from './app/plan-editor';
import {algorithmWeightDefaults,proposalRows} from './lib/optimizer';
import {reviewPlan} from './lib/plan-review';
const players=Array.from({length:8},(_,i)=>({id:i+1,name:'Player '+(i+1),memberNo:String(i+1),cr:4,gender:'M',age:40,availability:i===0?['18:00']:i===4?['19:00']:['18:00','19:00'],requestedHours:1,signupOrder:i+1,status:'active'}));
const input={players,slots:[{court:1,startTime:'18:00'},{court:1,startTime:'19:00'}],locked:[],history:[],weights:algorithmWeightDefaults};
let plan=[{court:1,startTime:'18:00',team1:[1,2],team2:[3,4]},{court:1,startTime:'19:00',team1:[5,6],team2:[7,8]}];
const names=new Map(players.map(p=>[p.id,p.name]));
window.savedCount=0;
window.fetch=async(url,options)=>{if(url!=='/api/optimizer')throw Error('Unexpected request');const body=JSON.parse(options.body);
if(body.action==='edit_context')return Response.json({matches:plan,players,locked:[],weights:input.weights,fingerprint:'fixture',...reviewPlan(plan,input)});
if(body.action==='review_edit')return Response.json(reviewPlan(body.matches,input));
if(body.action==='save_edit'){const result=reviewPlan(body.matches,input);if(!result.valid)throw Error('Invalid save');plan=body.matches;window.savedCount++;return Response.json({ok:true});}
throw Error('Unexpected action');};
function App(){const [rows,setRows]=useState(proposalRows(plan,names));const [pending,setPending]=useState(false);
return <><p id="pending">{String(pending)}</p><PlanEditor event={{id:1,status:'draft'}} rows={rows} scores={[90,90]} busy={false} isOpen={false} refresh={()=>setRows(proposalRows(plan,names))} onPendingChange={setPending}/></>;}
createRoot(document.getElementById('root')).render(<App/>);
`},bundle:true,write:false,format:'iife',platform:'browser',define:{'process.env.NODE_ENV':'"development"'},alias:{'@':process.cwd()}});
const server=createServer((req,res)=>{
  if(req.url==='/app.js'){res.setHeader('Content-Type','application/javascript');res.end(bundle.outputFiles[0].contents);}
  else {res.setHeader('Content-Type','text/html; charset=utf-8');res.end('<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><style>body{font-family:sans-serif;max-width:700px;margin:10px}table{width:100%;table-layout:fixed}td{padding:5px}button{min-height:44px;margin:3px}td button{width:100%;display:block}.touch-none{touch-action:none}.text-red-700{color:rgb(185,28,28)}</style><div id="root"></div><script src="/app.js"></script>');}
});
await new Promise(r=>server.listen(0,'127.0.0.1',r));
let browser, socket;
try {
  browser=spawn(edge,['--headless','--disable-gpu','--no-first-run','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
  const wsURL=await new Promise((resolveURL,reject)=>{
    let output='';const timeout=setTimeout(()=>reject(Error('Edge startup timed out')),20000);
    browser.once('error',e=>{clearTimeout(timeout);reject(e);});
    browser.stderr.on('data',chunk=>{output+=chunk;const found=output.match(/DevTools listening on (ws:\/\/\S+)/);if(found){clearTimeout(timeout);resolveURL(found[1]);}});
  });
  socket=new WebSocket(wsURL);await new Promise((r,j)=>{socket.onopen=r;socket.onerror=j;});
  let next=0;const pending=new Map();
  socket.onmessage=event=>{const reply=JSON.parse(event.data);const waiter=pending.get(reply.id);if(waiter){pending.delete(reply.id);reply.error?waiter.reject(Error(JSON.stringify(reply.error))):waiter.resolve(reply.result);}};
  const call=(method,params={},sessionId)=>new Promise((resolveCall,reject)=>{const id=++next;pending.set(id,{resolve:resolveCall,reject});socket.send(JSON.stringify({id,method,params,sessionId}));});
  const {targetId}=await call('Target.createTarget',{url:'about:blank'});
  const {sessionId}=await call('Target.attachToTarget',{targetId,flatten:true});
  const page=(method,params)=>call(method,params,sessionId);
  const evaluate=async expression=>{const result=await page('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;};
  const until=async expression=>{for(let attempt=0;attempt<100;attempt++){if(await evaluate(expression))return;await new Promise(r=>setTimeout(r,50));}throw Error('Timeout: '+expression);};
  const click=async label=>{await evaluate(`Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes(${JSON.stringify(label)})).click()`);};
  await page('Page.navigate',{url:`http://127.0.0.1:${server.address().port}/`});
  await until(`!!Array.from(document.querySelectorAll('button')).find(b=>b.textContent.includes('Redigér'))`);
  await click('Redigér');await until(`document.querySelectorAll('[data-plan-slot]').length===8`);
  const point=async key=>evaluate(`(()=>{const r=document.querySelector('[data-plan-slot="${key}"]').getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);
  const from=await point('0:0:0'),to=await point('1:0:0');
  await page('Input.dispatchMouseEvent',{type:'mousePressed',...from,button:'left',buttons:1,clickCount:1});
  await page('Input.dispatchMouseEvent',{type:'mouseMoved',...to,button:'left',buttons:1});
  await page('Input.dispatchMouseEvent',{type:'mouseReleased',...to,button:'left',buttons:0,clickCount:1});
  await until(`document.querySelector('[data-plan-slot="0:0:0"]').textContent.includes('Player 5')`);
  await click('Afslut redigering');await until(`!!document.querySelector('[role="alert"]')`);
  assert.equal(await evaluate('window.savedCount'),0);
  assert.equal(await evaluate(`document.querySelectorAll('[data-plan-slot].text-red-700').length`),2);
  await click('Annuller');await click('Redigér');await until(`document.querySelectorAll('[data-plan-slot]').length===8`);
  await evaluate(`document.querySelector('[data-plan-slot="0:0:1"]').click()`);
  await evaluate(`document.querySelector('[data-plan-slot="1:0:1"]').click()`);
  await click('Afslut redigering');await until('window.savedCount===1 && !document.querySelector("[data-plan-slot]")');
  await page('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await page('Emulation.setTouchEmulationEnabled',{enabled:true});
  await click('Redigér');await until(`document.querySelectorAll('[data-plan-slot]').length===8`);
  const a=await point('0:0:0'),b=await point('1:0:0');
  await page('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{...a,id:1}]});
  await page('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{...b,id:1}]});
  await page('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});
  await until(`document.querySelector('[data-plan-slot="0:0:0"]').textContent.includes('Player 5')`);
  console.log('PASS: desktop drag, mobile touch drag, tap-to-swap, invalid players red, invalid edits not saved, valid edits saved.');
} finally {
  if(socket)socket.close();
  if(browser)browser.kill();
  server.closeAllConnections();await new Promise(r=>server.close(r));
}
