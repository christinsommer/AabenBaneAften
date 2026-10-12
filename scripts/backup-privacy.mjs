import {mkdirSync,writeFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {verifyExport,exportLocalD1} from './privacy-backup-lib.mjs';
const mode=process.argv[2];
if(!['--local','--remote'].includes(mode)||process.argv.length!==3)throw Error('Usage: node scripts/backup-privacy.mjs --local|--remote');
const directory=`.data/privacy-backups/${new Date().toISOString().replace(/[:.]/g,'-')}`;
mkdirSync(directory,{recursive:true});
if(mode==='--local')await exportLocalD1('.wrangler/local-dev/v3',`${directory}/database.sql`);
else{
 const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote',`--output=${directory}/database.sql`],{encoding:'utf8',windowsHide:true,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
 writeFileSync(`${directory}/export.log`,`${result.stdout??''}\n${result.stderr??''}`);
 if(result.status!==0)throw Error(`Export failed; private details: ${directory}/export.log`);
}
const report=verifyExport(`${directory}/database.sql`,`${directory}/restored-rehearsal.sqlite`);
console.log(JSON.stringify({directory,...report}));
