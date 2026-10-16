import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, openSync, closeSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import {verifyExport,verifyLiveExport} from './privacy-backup-lib.mjs';

const check = process.argv.includes('--check');
const full = process.argv.includes('--with-optimizer');
const options = process.argv.slice(2);
if (options.some(arg => !['--check','--with-optimizer'].includes(arg) && !/^--container-wait-minutes=\d+$/.test(arg) && !/^--superadmin-member=\d+$/.test(arg))) throw new Error('Invalid release arguments');
const waitMinutes = Number(options.find(arg => arg.startsWith('--container-wait-minutes='))?.split('=')[1] ?? 15);
if (waitMinutes < 1 || waitMinutes > 60) throw new Error('Container wait must be 1-60 minutes');
const member = options.find(arg => arg.startsWith('--superadmin-member='))?.split('=')[1];
const adminArgs = member ? [member] : [];
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const adapter = 'node_modules/@opennextjs/cloudflare/dist/cli/index.js';
mkdirSync('.data/releases', { recursive: true });
const lock = '.data/releases/release.lock';
const fd = openSync(lock, 'wx');
async function run(script, args = [], output) {
  const logFile = output ?? `.data/releases/step-${Date.now()}-${script.replace(/[^a-zA-Z0-9-]/g, '_')}.log`;
  console.log(`Running ${script} ${args.join(' ')}`);
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  delete env.NODE_TEST_CONTEXT;
  const started = Date.now();
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script, ...args], {
      stdio: ['ignore', 'pipe', 'pipe'], env, windowsHide: true,
    });
    let captured = '', timedOut = false;
    child.stdout.on('data', chunk => { captured += chunk; if (!output) process.stdout.write(chunk); });
    child.stderr.on('data', chunk => { captured += chunk; if (!output) process.stderr.write(chunk); });
    const heartbeat = setInterval(() => console.log(`Still running (${Math.round((Date.now() - started) / 1000)}s): ${script} ${args.join(' ')}`), 30000);
    const timeout = setTimeout(() => {
      timedOut = true;
      console.error(`Timeout after 15 minutes: ${script} ${args.join(' ')}`);
      if (process.platform === 'win32') spawnSync('taskkill.exe', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true, timeout: 10000 });
      else child.kill('SIGKILL');
    }, 900000);
    const cleanup = () => { clearInterval(heartbeat); clearTimeout(timeout); };
    child.once('error', error => { cleanup(); reject(error); });
    child.once('close', (code, signal) => {
      cleanup();
      writeFileSync(logFile, captured);
      if (timedOut || code !== 0) reject(new Error(`Stopped: ${script} ${args.join(' ')}; ${timedOut ? 'timed out' : `exit ${code}, signal ${signal}`}; details: ${logFile}\n${captured.slice(-4000)}`));
      else { console.log(`Completed in ${Math.round((Date.now() - started) / 1000)}s: ${script}`); resolve(); }
    });
  });
}
try {
  await run('scripts/check-cloudflare-config.mjs');
  await run('scripts/optimizer-service.mjs', ['test']);
  const id = randomUUID();
  writeFileSync('lib/release-info.json', JSON.stringify({ id }) + '\n');
  await run(adapter, ['build']);
  await run('--test', ['--test-concurrency=1', ...readdirSync('tests').filter(f => f.endsWith('.test.mjs')).map(f => `tests/${f}`)]);
  if (check) {
    console.log('Release check passed. No production commands executed.');
  } else {
    // Validate production prerequisites before the first production mutation.
    await run('scripts/deploy-superadmin.mjs', ['check', ...adminArgs]);
    const directory = `.data/releases/${new Date().toISOString().replace(/[:.]/g, '-')}`;
    mkdirSync(directory);
    await run(wrangler, ['d1', 'export', 'DB', '--remote', `--output=${directory}/database.sql`], `${directory}/backup.log`);
    if (statSync(`${directory}/database.sql`).size < 100) throw new Error('Backup is empty; deployment stopped');
    const backupReport = verifyExport(directory+'/database.sql', directory+'/restored-rehearsal.sqlite');
    console.log('Backup restored and migration rehearsed; counts:', JSON.stringify(backupReport.counts));
    await run(wrangler, ['d1', 'migrations', 'apply', 'DB', '--remote']);
    await run(wrangler, ['d1', 'export', 'DB', '--remote', '--output='+directory+'/after-migration.sql'], directory+'/after-export.log');
    verifyLiveExport(directory+'/database.sql',directory+'/after-migration.sql');
    if (full) {
      await run('scripts/optimizer-cloudflare.mjs', ['deploy']);
      const deadline = Date.now() + waitMinutes * 60000;
      for (;;) {
        try { await run('scripts/optimizer-cloudflare.mjs', ['check']); break; }
        catch (error) {
          if (Date.now() >= deadline) throw error;
          console.log('Waiting 30 seconds for the optimizer rollout...');
          await new Promise(resolve => setTimeout(resolve, 30000));
        }
      }
      await run('scripts/optimizer-cloudflare.mjs', ['connect']);
    }
    await run('scripts/deploy-superadmin.mjs', ['apply', ...adminArgs]);
    await run(adapter, ['deploy']);
    let verified = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      try {
        const response = await fetch(`https://aabenbaneaften.dk/api/health?release=${id}`, { signal: AbortSignal.timeout(10000), cache: 'no-store' });
        const health = await response.json();
        if (response.ok && health.ok && health.release === id) { verified = true; break; }
      } catch { /* allow propagation before retry */ }
      console.log('Waiting for the new release...');
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
    if (!verified) throw new Error(`Deployment health check failed. Backup: ${directory}/database.sql. Inspect Cloudflare before retrying; no automatic database rollback.`);
    if (full) await run('scripts/optimizer-cloudflare.mjs', ['check']);
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ id, verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`Published and verified: https://aabenbaneaften.dk (backup: ${directory}/database.sql)`);
  }
} finally { closeSync(fd); unlinkSync(lock); }
