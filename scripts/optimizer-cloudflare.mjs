import {spawnSync} from 'node:child_process';
import {existsSync, mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {randomBytes} from 'node:crypto';
import {join, resolve, delimiter} from 'node:path';
import assert from 'node:assert/strict';
import {algorithmWeightDefaults, scoreMatch, validateProposal} from '../lib/optimizer.ts';

const mode = process.argv[2];
if (!['deploy','check','connect'].includes(mode)) throw new Error('Use deploy, check or connect');
const config = 'optimizer-cloudflare/wrangler.jsonc';
const url = 'https://aabenbane-optimizer.aabenbaneaften.workers.dev';
const secretFile = '.data/optimizer-production/key';
const env = {...process.env, WRANGLER_SEND_METRICS:'false', CI:'1'};
if (process.platform === 'win32') {
  const candidates = [join(process.env.LOCALAPPDATA ?? '', 'Programs/DockerDesktop/resources/bin'), 'C:/Program Files/Docker/Docker/resources/bin'];
  const bin = candidates.find(path=>existsSync(join(path,'docker.exe')));
  if (bin) env.PATH = bin + delimiter + (env.PATH ?? env.Path ?? '');
  delete env.Path;
}
function wrangler(args, payload) {
  const result = spawnSync(process.execPath, ['node_modules/wrangler/bin/wrangler.js', ...args], {
    env, input:payload, stdio:[payload ? 'pipe':'ignore','inherit','inherit'], windowsHide:true, timeout:900000,
  });
  if (result.error || result.status !== 0) throw new Error(`Wrangler failed: ${args[0]}`, {cause:result.error});
}
if (mode === 'deploy' && !existsSync(secretFile)) {
  mkdirSync(resolve('.data/optimizer-production'), {recursive:true});
  writeFileSync(secretFile, randomBytes(32).toString('hex'), {flag:'wx', mode:0o600});
}
if (!existsSync(secretFile)) throw new Error('Production key missing; deploy the optimizer first.');
const key = readFileSync(secretFile,'utf8').trim();
if (key.length < 32) throw new Error('Invalid production key');
if (mode === 'deploy') {
  wrangler(['deploy','--config',config]);
  wrangler(['secret','bulk','--config',config], JSON.stringify({OPTIMIZER_API_KEY:key}));
  console.log('Container deployed. Run check after Cloudflare finishes provisioning.');
} else {
  const headers = {authorization:`Bearer ${key}`, 'content-type':'application/json'};
  const health = await fetch(`${url}/health`, {headers,signal:AbortSignal.timeout(660000)});
  assert.equal(health.status,200,`Container health returned ${health.status}`);
  assert.equal((await health.json()).scoringVersion,'unique-partners-v4');
  const match = {court:1,startTime:'18:00',team1:[1,2],team2:[3,4]};
  const input = {
    players:[2,5,3,4].map((cr,i)=>({id:i+1,memberNo:`smoke-${i+1}`,cr,gender:'M',age:40,availability:['18:00'],requestedHours:1,signupOrder:i+1,status:'active'})),
    slots:[{court:1,startTime:'18:00'}],history:[],locked:[match],weights:algorithmWeightDefaults,
  };
  const reply = await fetch(`${url}/solve`,{method:'POST',headers,body:JSON.stringify(input),signal:AbortSignal.timeout(660000)});
  assert.equal(reply.status,200,`Container solve returned ${reply.status}`);
  const result = await reply.json();
  validateProposal(result.matches,input);
  assert.equal(result.score,scoreMatch(match,input).score);
  assert.equal(result.score,30);
  const spouseInput = {...input, players: input.players.map((p,i) => ({...p,memberNo:String(i+1),cr:[1,5,3,3][i],
    ...(i === 0 ? {spouseNo:2,spouseMode:2} : {})}))};
  const spouseReply = await fetch(`${url}/solve`,{method:'POST',headers,body:JSON.stringify(spouseInput),signal:AbortSignal.timeout(660000)});
  assert.equal(spouseReply.status,200,`Container spouse check returned ${spouseReply.status}`);
  const spouseResult = await spouseReply.json();
  validateProposal(spouseResult.matches,spouseInput);
  assert.equal(spouseResult.score,scoreMatch(match,spouseInput).score);
  assert.equal(spouseResult.score,90);
  assert.equal((await fetch(`${url}/health`)).status,401);
  console.log('Production optimizer verified: authenticated Linux solver, CR factors, spouse constraints and score exception, unauthorized access rejected. No database changes.');
  if (mode === 'connect') {
    wrangler(['secret','bulk','--config','wrangler.jsonc'],JSON.stringify({OPTIMIZER_URL:url,OPTIMIZER_API_KEY:key}));
    console.log('aabenbaneaften connected to the verified optimizer.');
  }
}
