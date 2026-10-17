import {readFileSync,writeFileSync} from 'node:fs';
import {decryptBackup} from './backup-crypto.mjs';
import {required} from './operations-lib.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output||process.argv.length!==4)throw Error('Usage: node scripts/decrypt-backup.mjs INPUT.enc NEW-OUTPUT.sql');
writeFileSync(output,decryptBackup(readFileSync(input),required('BACKUP_ENCRYPTION_KEY')),{flag:'wx',mode:0o600});
console.log('Decrypted to a new local file. No production import performed.');
