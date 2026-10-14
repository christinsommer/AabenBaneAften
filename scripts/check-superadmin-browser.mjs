import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {getPlatformProxy,unstable_dev} from 'wrangler';
import {migrationStatements} from './migration-statements.mjs';
import {hashPin} from '../lib/credentials.ts';
const folder=mkdtempSync(join(tmpdir(),'hik-privacy-browser-'));
const artifacts='.data/privacy-browser';mkdirSync(artifacts,{recursive:true});
let proxy,worker,chrome,socket,dev;
const originalNext=readFileSync('next.config.ts'),originalWrangler=readFileSync('wrangler.jsonc'),originalDevVars=readFileSync('.dev.vars'),originalTsconfig=readFileSync('tsconfig.json');
try{
 proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(folder,'v3')}});
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await proxy.env.DB.batch(migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(q=>proxy.env.DB.prepare(q)));
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('browser-admin','Synthetic Admin','Synthetic','Admin','browser@example.test','K','B',?,'admin')").bind(await hashPin('0123')).run();
 await proxy.env.DB.prepare("UPDATE profile_privacy SET last_active_at='2020-01-01',activity_known=1").run();
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('local-admin','Synthetic Local Admin','Synthetic','Local','local@example.test','K','B',?,'admin')").bind(await hashPin('0123')).run();
 await proxy.dispose();proxy=undefined;
 const config=JSON.parse(originalWrangler);config.vars={...config.vars,SUPERADMIN_PLAYER_ID:'1',RESEND_API_KEY:'',NEWSLETTER_ENABLED:'false'};writeFileSync('wrangler.jsonc',JSON.stringify(config,null,2));
 // Local secrets override config.vars, so explicitly isolate the browser fixture.
 writeFileSync('.dev.vars','SUPERADMIN_PLAYER_ID=1\nRESEND_API_KEY=\nNEWSLETTER_ENABLED=false\n');
 writeFileSync('next.config.ts',originalNext.toString().replace('path: ".wrangler/local-dev/v3"','path: '+JSON.stringify(join(folder,'v3'))).replace('const nextConfig: NextConfig = {','const nextConfig: NextConfig = { distDir: ".data/next-superadmin-browser-'+Date.now()+'",'));
 dev=spawn(process.execPath,['node_modules/next/dist/bin/next','dev','--hostname','localhost','--port','3101'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let serverError='';dev.stderr.on('data',c=>serverError+=c);
 const base='http://localhost:3101';
 for(let i=0;i<180;i++){try{if((await fetch(base)).ok)break;}catch{}if(i===179)throw Error('Local review server failed: '+serverError);await delay(500);}

 chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(folder,'chrome')}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='',launchError;chrome.stderr.on('data',c=>stderr+=c);chrome.on('error',e=>launchError=e);
 for(let i=0;i<100&&!stderr.includes('DevTools listening on');i++){if(launchError)throw launchError;await delay(100);}
 const port=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];assert.ok(port,'Chrome started');
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const pending=new Map(),errors=[];let sequence=0;
 socket.addEventListener('message',({data})=>{const e=JSON.parse(data);if(e.id&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);if(e.error)p.reject(Error(JSON.stringify(e.error)));else p.resolve(e.result);}if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);});
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method}`));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function until(expression){for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}writeFileSync(`${artifacts}/failure.txt`,await evaluate('document.body.innerText'));await screenshot('failure');throw Error(`Browser condition not met: ${expression}`);}
 async function click(text,exact=true){const point=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&${exact?`b.textContent.trim()===${JSON.stringify(text)}`:`b.textContent.includes(${JSON.stringify(text)})`});if(!b)return null;b.scrollIntoView({block:'center',inline:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);assert.ok(point,`Button: ${text}`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await delay(250);}
 async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`${artifacts}/${name}.png`,Buffer.from(shot.data,'base64'));}
 async function noOverflow(){assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No mobile horizontal overflow');}
 await send('Runtime.enable');await send('Page.enable');await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:base});await until("document.querySelector('[name=memberNo]')");
 await click('Opret profil');await until("document.querySelector('[name=privacyRead]')");
 assert.ok(await evaluate("document.querySelector('[name=privacyRead]').required&&!document.querySelector('[name=privacyRead]').checked"),'Privacy acknowledgement is required and unchecked');
 assert.ok(await evaluate("!document.querySelector('[name=newsletter]').required&&!document.querySelector('[name=newsletter]').checked"),'Newsletter consent is optional and unchecked');
 for(const path of ['/privacy','/cookies']){
  assert.equal(await evaluate(`document.querySelector('form a[href="${path}"]').target`),'_blank');
  assert.equal(await evaluate(`fetch('${path}').then(r=>r.status)`),200);
 }
 await evaluate(`(()=>{const form=document.querySelector('[name=privacyRead]').form;for(const [name,value] of Object.entries({firstName:'Synthetic',lastName:'Registration',email:'registration@example.test',gender:'K',level:'B',memberNo:'browser-registration',pin:'0123'})){form.elements.namedItem(name).value=value;}return true;})()`);
 assert.equal(await evaluate("document.querySelector('[name=privacyRead]').form.checkValidity()"),false,'Cannot submit without acknowledgement');
 await evaluate("document.querySelector('[name=privacyRead]').click()");
 assert.equal(await evaluate("document.querySelector('[name=privacyRead]').form.checkValidity()"),true,'Can submit after acknowledgement');
 await screenshot('registration-privacy-mobile');await noOverflow();
 await evaluate("document.querySelector('[name=privacyRead]').form.requestSubmit()");
 await until("document.body.innerText.includes('Du er nu oprettet')");
 const registered=await evaluate("fetch('/api/app').then(r=>r.json())");
 assert.equal(registered.user.memberNo,'browser-registration');
 const privacy=await evaluate("fetch('/api/privacy').then(r=>r.json())");
 assert.equal(privacy.needsAcknowledgement,false);assert.equal(privacy.newsletter.status,'never');
 await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})})");
 await send('Page.navigate',{url:base});await until("document.querySelector('[name=memberNo]')");
 const login=await evaluate(`fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',memberNo:'browser-admin',pin:'0123'})}).then(r=>r.status)`);assert.equal(login,200);
 await send('Page.reload');await until("document.querySelector('[role=dialog]')");await screenshot('information-mobile');await noOverflow();
 assert.equal(await evaluate("document.querySelector('[role=dialog] a[href=\"/cookies\"]').getAttribute('target')"),'_blank');
 await click('Jeg har læst informationen');await until("!document.querySelector('[role=dialog]')");
 await click('SuperAdmin');await until("document.body.innerText.includes('Standard for kampplan')");
 for(const title of ['Standard for kampplan','Optimerings-faktorer','CPU og tid for optimering','ChatGPT-forslag til kampplan','Test e-mail'])assert.ok(await evaluate('document.body.innerText.includes('+JSON.stringify(title)+')'));
 assert.ok(await evaluate("document.body.innerText.indexOf('Standard for kampplan')>document.body.innerText.indexOf('ChatGPT-forslag til kampplan')"),'Defaults appear after ChatGPT');
 await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Foreslå kampe'&&!b.disabled)");
 assert.ok(await evaluate("document.body.innerText.includes('Foreslå kampe')"),'ChatGPT proposal is in SuperAdmin');
 assert.equal(await evaluate("fetch('/api/superadmin/prompt').then(r=>r.status)"),200);
 await noOverflow();await screenshot('superadmin-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await screenshot('superadmin-desktop');
 assert.equal(await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',memberNo:'local-admin',pin:'0123'})}).then(r=>r.status)"),200);
 await send('Page.reload');await until("document.querySelector('[role=dialog]')");await click('Jeg har læst informationen');await until("!document.querySelector('[role=dialog]')");
 assert.ok(await evaluate("![...document.querySelectorAll('[role=tab]')].some(t=>t.textContent==='SuperAdmin')"),'Local administrator cannot see SuperAdmin');
 assert.ok(await evaluate("[...document.querySelectorAll('[data-slot=card-title]')].some(e=>e.textContent.trim()==='Spilledage')"),'Member calendar is visible under Tilmeldinger');
 await click('Kampplan');
 assert.ok(await evaluate("![...document.querySelectorAll('[data-slot=card-title]')].some(e=>e.textContent.trim()==='Spilledage')"),'Member calendar is only shown under Tilmeldinger');
 await click('Admin',false);await click('Kampplan Admin');
 await until("document.querySelector('[role=tab][data-state] [aria-label$=\"profiler til gennemgang\"]')");
 assert.ok(await evaluate("!document.body.innerText.includes('privatlivsopgaver:')"),'No page-top privacy banner');
 await click('Medlemmer',false);
 assert.equal(await evaluate("document.body.innerText.split('Sletning håndteres under Privatliv & inaktive profiler').length-1"),1,'One deletion hint for all members');
 await noOverflow();await screenshot('members-desktop');
 await click('Kampplan Admin');
 assert.ok(await evaluate("[...document.querySelectorAll('button')].some(b=>b.textContent.includes('Algoritme foreslå kampe'))"),'Algorithm button remains in Kampplan Admin');
 assert.ok(await evaluate("![...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Foreslå kampe')"),'ChatGPT proposal moved out of Admin');
 assert.ok(await evaluate("!document.body.innerText.includes('FactorMatchDifference')"),'Optimization factors moved out of Admin');
 const local=await evaluate("fetch('/api/app').then(r=>r.json())");assert.equal(local.user.isSuperAdmin,false);assert.equal(local.optimizerDefaults,undefined);assert.equal(local.optimizerResources,undefined);
 assert.equal(await evaluate("fetch('/api/superadmin/prompt').then(r=>r.status)"),403);
 for(const action of ['set_optimizer_defaults','set_event_optimizer_weights','set_optimizer_resources','send_test_email'])assert.equal(await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:"+JSON.stringify(action)+"})}).then(r=>r.status)"),403);
 await screenshot('local-admin-desktop');
 assert.deepEqual(errors,[]);console.log('PASS: SuperAdmin sections visible at 390px/1440px; local Admin has no tab, settings or API access; no real profiles or mail.');
}finally{writeFileSync('tsconfig.json',originalTsconfig);writeFileSync('.dev.vars',originalDevVars);writeFileSync('next.config.ts',originalNext);writeFileSync('wrangler.jsonc',originalWrangler);dev?.kill();socket?.close();if(chrome){chrome.kill();await delay(500);}await worker?.stop();await proxy?.dispose();try{rmSync(folder,{recursive:true,force:true});}catch{/* Chrome may release its temporary profile asynchronously. */}}
