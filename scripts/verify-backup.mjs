import {existsSync} from 'node:fs';
import {verifyExport} from './privacy-backup-lib.mjs';
const [input,output]=process.argv.slice(2);
if(!input||!output||process.argv.length!==4)throw Error('Usage: node scripts/verify-backup.mjs INPUT.sql NEW-OUTPUT.sqlite');
if(existsSync(output))throw Error('Output must be a new file');
verifyExport(input,output);
console.log('Isolated restore verified. No production import performed.');
