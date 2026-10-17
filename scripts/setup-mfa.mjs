import {spawnSync} from 'node:child_process';
import {randomBytes} from 'node:crypto';
import {readFileSync,appendFileSync,existsSync} from 'node:fs';

const mode=process.argv[2];
if(mode==='--local') {
 const file='.dev.vars',text=existsSync(file)?readFileSync(file,'utf8'):'';
 if(!/^MFA_ENCRYPTION_KEY=/m.test(text))appendFileSync(file,`\nMFA_ENCRYPTION_KEY=${randomBytes(32).toString('hex')}\n`);
 console.log('Local MFA encryption key ready in ignored .dev.vars. Existing key preserved.');
} else if(mode==='--check-remote') {
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','secret','list','--config','wrangler.jsonc'],{encoding:'utf8',windowsHide:true,timeout:120000,env:{...process.env,CI:'1',WRANGLER_SEND_METRICS:'false'}});
 if(result.error||result.status!==0)throw Error('Could not check production MFA secret. '+result.stderr);
 if(!JSON.parse(result.stdout).some(secret=>secret.name==='MFA_ENCRYPTION_KEY'))throw Error('MFA_ENCRYPTION_KEY is missing. Follow docs/admin-2fa.md before deploying. No production data has been changed.');
 console.log('Production MFA encryption secret exists.');
} else throw Error('Usage: node scripts/setup-mfa.mjs --local|--check-remote');
