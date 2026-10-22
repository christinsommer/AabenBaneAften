import {mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {join,resolve,sep} from 'node:path';
import {spawnSync} from 'node:child_process';
import {encryptBackup,decryptBackup} from './backup-crypto.mjs';
import {verifyExport} from './privacy-backup-lib.mjs';
import {required} from './operations-lib.mjs';

const key=required('BACKUP_ENCRYPTION_KEY');
encryptBackup(Buffer.from('preflight'),key);
required('CLOUDFLARE_ACCOUNT_ID');required('CLOUDFLARE_API_TOKEN');
mkdirSync('.data/operations',{recursive:true});
const root=resolve('.data/operations');
const directory=resolve(mkdtempSync(join(root,'run-')));
if(!directory.startsWith(root+sep))throw Error('Invalid backup workspace');
try {
  const sql=join(directory,'database.sql');
  const result=spawnSync(process.execPath,['node_modules/wrangler/bin/wrangler.js','d1','export','DB','--remote',`--output=${sql}`],{encoding:'utf8',windowsHide:true,timeout:600000,env:{...process.env,WRANGLER_SEND_METRICS:'false'}});
  if(result.status!==0)throw Error('Remote backup export failed');
  const encrypted=encryptBackup(readFileSync(sql),key);
  const artifact=join(directory,'database.sql.enc');
  writeFileSync(artifact,encrypted,{flag:'wx',mode:0o600});
  // Read the actual encrypted file back, authenticate it, then rehearse SQL restore.
  const recovered=decryptBackup(readFileSync(artifact),key);
  if(!recovered.equals(readFileSync(sql)))throw Error('Backup round-trip mismatch');
  const rehearsal=join(directory,'recovered.sql');
  writeFileSync(rehearsal,recovered,{flag:'wx',mode:0o600});
  verifyExport(rehearsal,join(directory,'restored.sqlite'));
  mkdirSync('backups/operations',{recursive:true});
  writeFileSync('backups/operations/database.sql.enc',encrypted,{mode:0o600});
  console.log('Encrypted backup and isolated restore verification succeeded.');
}finally {
  // directory is created by mkdtempSync under this workspace, never user input.
  rmSync(directory,{recursive:true,force:true});
}
