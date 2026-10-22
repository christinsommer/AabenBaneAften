import {notify} from './operations-lib.mjs';
const job=process.argv[2];
if(!['backup','monitor'].includes(job))throw Error('Expected backup or monitor');
// Deliberately excludes raw errors, logs, tokens and database contents.
await notify(`failure-${job}-${Math.floor(Date.now()/86400000)}`,`Driftskontrollen ${job} fejlede. Kontrollér GitHub Actions for AabenBaneAften. Ingen succes er registreret for den fejlede kørsel. Gentagne fejl giver højst én besked pr. job pr. UTC-døgn.`);
