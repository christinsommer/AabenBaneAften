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
const folder=mkdtempSync(join(tmpdir(),'hik-privacy-browser-'));
const artifacts='.data/privacy-browser';mkdirSync(artifacts,{recursive:true});
let proxy,worker,chrome,socket,frameHost;
try{
 proxy=await getPlatformProxy({configPath:'wrangler.jsonc',persist:{path:join(folder,'v3')}});
 for(const file of readdirSync('drizzle').filter(f=>f.endsWith('.sql')).sort())await proxy.env.DB.batch(migrationStatements(readFileSync(`drizzle/${file}`,'utf8')).map(q=>proxy.env.DB.prepare(q)));
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('browser-admin','Synthetic Admin','Synthetic','Admin','browser@example.test','K','B',?,'admin')").bind(await hashPin('0123')).run();
 await proxy.env.DB.prepare("INSERT INTO players(member_no,name,first_name,last_name,email,gender,self_level,pin_hash,role) VALUES('browser-member','Synthetic Member','Synthetic','Member','member@example.test','K','B',?,'player')").bind(await hashPin('0123')).run();
 await proxy.env.DB.prepare("UPDATE profile_privacy SET last_active_at='2020-01-01',activity_known=1").run();
 await proxy.dispose();proxy=undefined;
 worker=await unstable_dev('.open-next/worker.js',{config:'wrangler.jsonc',local:true,port:0,persist:true,persistTo:folder,vars:{RESEND_API_KEY:'',NEWSLETTER_ENABLED:'false'},logLevel:'error',experimental:{disableExperimentalWarning:true,watch:false}});
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
 const login=await evaluate(`fetch('/api/app',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'login',memberNo:'browser-admin',pin:'0123'})}).then(r=>r.status)`);assert.equal(login,200);
 await send('Page.reload');await until("document.querySelector('[role=dialog]')");await screenshot('information-mobile');await noOverflow();
 assert.equal(await evaluate("document.querySelector('[role=dialog] a[href=\"/cookies\"]').getAttribute('target')"),'_blank');
 await click('Jeg har læst informationen');await until("!document.querySelector('[role=dialog]')");
 await click('Profil');await until("document.body.innerText.includes('Nyhedsmails')");await noOverflow();await screenshot('profile-mobile');
 await click('Admin',false);await click('Privatliv & inaktive profiler',false);await until("document.body.innerText.includes('Lukning kræver altid din bekræftelse')");await noOverflow();await screenshot('privacy-admin-mobile');
 for(const label of ['Kontakt medlem','Behold profil','Luk profil']){
  await click(label);await until("document.querySelector('dialog[open]')");
  assert.ok(await evaluate("(()=>{const d=document.querySelector('dialog[open]'),r=d.getBoundingClientRect();return r.top>=0&&r.bottom<=innerHeight&&d.contains(document.activeElement);})()"),'Review dialog visible and focused');
  if(label==='Luk profil')assert.ok(await evaluate("[...document.querySelectorAll('dialog button')].find(b=>b.textContent.includes('Bekræft lukning')).disabled"),'Deletion requires confirmation and respects blockers');
  await noOverflow();await click('Luk vinduet');await until("!document.querySelector('dialog[open]')");
 }
 await click('Nyhedsmails');await until("[...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Opret nyhedsmail')");await click('Opret nyhedsmail');await click('Lav forslag fra kommende spilledage');await until("document.querySelector('textarea')?.value.includes('spilleaftener')");await click('Gem kladde');await click('Forhåndsvis');await noOverflow();await screenshot('newsletter-mobile');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1000,deviceScaleFactor:1,mobile:false});await screenshot('newsletter-desktop');
 await send('Page.navigate',{url:base+'/newsletter#'+'a'.repeat(64)});await until("document.body.innerText.includes('Dine nyhedsmails')");await until('!location.hash');await click('Afmeld nyhedsmails');await until("document.body.innerText.includes('Linket kan være udløbet')");
 assert.deepEqual(errors,[]);assert.deepEqual(policyErrors,[],'normal app use must not violate CSP');
 writeFileSync(`${artifacts}/document-policies.json`,JSON.stringify(documentPolicies,null,2));
 for(const document of documentPolicies)assert.match(Object.entries(document.headers).find(([key])=>key.toLowerCase()==='content-security-policy')?.[1]??'',/'nonce-[^']+'/,'browser navigation retains the nonce CSP');
 // Parse real HTML under the app's actual policy, without DevTools injecting code.
 const testNonce=documentPolicy.match(/'nonce-([^']+)'/)[1];
 frameHost=createServer((request,response)=>{
   response.setHeader('Content-Type','text/html');
   if(request.url==='/csp-check'){
     response.setHeader('Content-Security-Policy',documentPolicy);
     response.end(`<html><body><script nonce="${testNonce}">window.allowedCspScript=true</script><script>window.__injectedScriptRan=true</script></body></html>`);
   }else response.end(`<html><body><iframe src="${base}"></iframe></body></html>`);
 });
 await new Promise(resolve=>frameHost.listen(0,'127.0.0.1',resolve));
 await send('Page.navigate',{url:`http://127.0.0.1:${frameHost.address().port}/csp-check`});
 await until('window.allowedCspScript===true');
 await until("window.__cspViolations.includes('script-src-elem')");
 assert.equal(await evaluate('window.__injectedScriptRan===true'),false,'injected inline JavaScript is blocked');
 await send('Page.navigate',{url:`http://127.0.0.1:${frameHost.address().port}`});
 for(let i=0;i<100&&!policyErrors.some(message=>message.includes('frame-ancestors'));i++)await delay(100);
 assert.ok(policyErrors.some(message=>message.includes('frame-ancestors')),'browser rejects embedding from another origin');
 console.log('PASS: mobile 390px, desktop, version dialog, profile, privacy admin, newsletter proposal/save/preview and explicit token action. No CSP violations during normal use; injected script blocked. No real mail credentials.');
}finally{socket?.close();frameHost?.closeAllConnections();if(frameHost)await new Promise(resolve=>frameHost.close(resolve));if(chrome){chrome.kill();await delay(500);}await worker?.stop();await proxy?.dispose();try{rmSync(folder,{recursive:true,force:true});}catch{/* Chrome may release its temporary profile asynchronously. */}}
