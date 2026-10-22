import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer} from 'node:http';
import {mkdtempSync,mkdirSync,readFileSync,readdirSync,writeFileSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {setTimeout as delay} from 'node:timers/promises';
import {getPlatformProxy,unstable_dev} from 'wrangler';
import {migrationStatements} from './migration-statements.mjs';
import {hashPin} from '../lib/credentials.ts';
import {totp} from '../lib/totp.ts';
const folder=mkdtempSync(join(tmpdir(),'hik-mfa-browser-'));
const artifacts='.data/mfa-browser';mkdirSync(artifacts,{recursive:true});
let proxy,worker,chrome,socket,frameHost;
try{
 proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(folder,'v3')}});
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await proxy.env.DB.batch(migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(q=>proxy.env.DB.prepare(q)));
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('90001','Synthetic Admin','Synthetic','Admin','browser@example.test','K','B',?,'admin')").bind(await hashPin('0123')).run();
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('browser-member','Synthetic Member','Synthetic','Member','member@example.test','K','B',?,'player')").bind(await hashPin('0123')).run();
 await proxy.env.DB.prepare("UPDATE profile_privacy SET last_active_at='2020-01-01',activity_known=1").run();
 await proxy.dispose();proxy=undefined;
 worker=await unstable_dev('.open-next/worker.js',{config:'wrangler.jsonc',local:true,port:0,persist:true,persistTo:folder,vars:{RESEND_API_KEY:'',NEWSLETTER_ENABLED:'false',MFA_ENCRYPTION_KEY:'a'.repeat(64)},logLevel:'error',experimental:{disableExperimentalWarning:true,watch:false}});
 const base=`http://${worker.address}:${worker.port}`;
 const documentResponse=await fetch(base);
 const documentPolicy=documentResponse.headers.get('content-security-policy');
 assert.match(documentPolicy,/'nonce-[^']+'/,'actual HTTP document response includes nonce CSP');
 assert.match(documentPolicy,/script-src [^;]*'strict-dynamic'/);
 await documentResponse.text();
 chrome=spawn(process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',['--headless=new','--disable-gpu','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${join(folder,'chrome')}`,'about:blank'],{windowsHide:true,stdio:['ignore','ignore','pipe']});
 let stderr='',launchError;chrome.stderr.on('data',c=>stderr+=c);chrome.on('error',e=>launchError=e);
 for(let i=0;i<100&&!stderr.includes('DevTools listening on');i++){if(launchError)throw launchError;await delay(100);}
 const port=stderr.match(/DevTools listening on ws:\/\/127\.0\.0\.1:(\d+)/)?.[1];assert.ok(port,'Chrome started');
 const targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);
 await new Promise((resolve,reject)=>{socket.addEventListener('open',resolve,{once:true});socket.addEventListener('error',reject,{once:true});});
 const pending=new Map(),errors=[],policyErrors=[],documentPolicies=[];let sequence=0;
 socket.addEventListener('message',({data})=>{const e=JSON.parse(data);if(e.method==='Network.responseReceived'&&e.params.type==='Document')documentPolicies.push({url:e.params.response.url,headers:e.params.response.headers});});
 socket.addEventListener('message',({data})=>{const e=JSON.parse(data);if(e.method==='Log.entryAdded'&&e.params.entry.source==='security')policyErrors.push(e.params.entry.text);});
 socket.addEventListener('message',({data})=>{const e=JSON.parse(data);if(e.id&&pending.has(e.id)){const p=pending.get(e.id);pending.delete(e.id);clearTimeout(p.timer);if(e.error)p.reject(Error(JSON.stringify(e.error)));else p.resolve(e.result);}if(e.method==='Runtime.exceptionThrown')errors.push(e.params.exceptionDetails.text);});
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++sequence,timer=setTimeout(()=>{pending.delete(id);reject(Error(`Timeout: ${method}`));},20000);pending.set(id,{resolve,reject,timer});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true,allowUnsafeEvalBlockedByCSP:false});if(r.exceptionDetails)throw Error(JSON.stringify(r.exceptionDetails));return r.result.value;}
 async function until(expression){for(let i=0;i<150;i++){if(await evaluate(`Boolean(${expression})`))return;await delay(100);}writeFileSync(`${artifacts}/failure.txt`,await evaluate('document.body.innerText'));writeFileSync(`${artifacts}/failure-errors.json`,JSON.stringify({errors,policyErrors},null,2));await screenshot('failure');throw Error(`Browser condition not met: ${expression}`);}
 async function click(text,exact=true){const point=await evaluate(`(()=>{const b=[...document.querySelectorAll('button')].find(b=>!b.disabled&&b.getBoundingClientRect().width>0&&${exact?`(b.getAttribute('aria-label')||b.textContent).trim()===${JSON.stringify(text)}`:`b.textContent.includes(${JSON.stringify(text)})`});if(!b)return null;b.scrollIntoView({block:'center',inline:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2};})()`);assert.ok(point,`Button: ${text}`);await send('Input.dispatchMouseEvent',{type:'mousePressed',...point,button:'left',clickCount:1});await send('Input.dispatchMouseEvent',{type:'mouseReleased',...point,button:'left',clickCount:1});await delay(250);}
 async function screenshot(name){const shot=await send('Page.captureScreenshot',{format:'png'});writeFileSync(`${artifacts}/${name}.png`,Buffer.from(shot.data,'base64'));}
 async function noOverflow(){assert.ok(await evaluate('document.documentElement.scrollWidth<=innerWidth+1'),'No mobile horizontal overflow');}
 await send('Runtime.enable');await send('Page.enable');await send('Log.enable');await send('Network.enable');
 await send('Page.addScriptToEvaluateOnNewDocument',{source:"window.__cspViolations=[];document.addEventListener('securitypolicyviolation',e=>window.__cspViolations.push(e.effectiveDirective));"});
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:844,deviceScaleFactor:1,mobile:true});
 await send('Page.navigate',{url:base});await until("document.querySelector('[name=memberNo]')");
 async function type(selector,text){await evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`);await send('Input.insertText',{text});}
 async function login(){await until("document.querySelector('[name=memberNo]')");await type('[name=memberNo]','90001');await type('[name=pin]','0123');assert.equal(await evaluate('document.querySelector("form").checkValidity()'),true);await evaluate("document.querySelector('button[type=submit]').click()");}
 await login();await until("document.body.innerText.includes('Opsæt 2FA til administratorlogin')");
 assert.equal(await evaluate("fetch('/api/app').then(r=>r.json()).then(r=>r.authenticated)"),false);
 assert.equal(await evaluate("document.querySelector('input[type=checkbox]').checked"),false);
 await until("document.querySelector('canvas')?.width===256");await noOverflow();await screenshot('setup-mobile');
 const secret=await evaluate("document.querySelector('details code').textContent");
 await type('#mfa-code',await totp(secret,Math.floor(Date.now()/30000)));
 await evaluate("document.querySelector('input[type=checkbox]').click()");
 await click('Bekræft');await until("document.body.innerText.includes('Gem dine gendannelseskoder')");
 const codes=await evaluate("[...document.querySelectorAll('li')].map(e=>e.textContent.replaceAll('-',''))");
 assert.equal(codes.length,10);await noOverflow();await screenshot('recovery-mobile');
 assert.equal(await evaluate("[...document.querySelectorAll('button')].find(b=>b.textContent==='Fortsæt').disabled"),true);
 await evaluate("document.querySelector('input[type=checkbox]').click()");await click('Fortsæt');
 await until("document.querySelector('[role=dialog]')");await click('Jeg har læst informationen');
 await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})})");
 await send('Page.navigate',{url:base});await login();
 await until("document.body.innerText.includes('Tilmeldinger')");
 assert.equal(await evaluate("fetch('/api/app').then(r=>r.json()).then(r=>r.authenticated)"),true,'remembered browser skips MFA after PIN');
 await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'mfa_forget_devices'})})");
 await evaluate("fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'logout'})})");
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url:base});await login();await until("document.body.innerText.includes('Bekræft dit login')");
 await screenshot('verify-desktop');
 await click('Brug en gendannelseskode');await type('#mfa-code',codes[0]);await click('Bekræft');
 await until("document.body.innerText.includes('Tilmeldinger')");
 assert.deepEqual(errors,[]);assert.deepEqual(policyErrors,[]);
 console.log('PASS: real mobile/desktop login, QR setup, recovery-code acknowledgement, 14-day remembered browser, revocation and recovery login; no CSP errors. Synthetic accounts only.');
}finally{socket?.close();if(chrome){chrome.kill();await delay(500);}await worker?.stop();await proxy?.dispose();try{rmSync(folder,{recursive:true,force:true});}catch{/* Chrome may release the temporary profile asynchronously. */}}
