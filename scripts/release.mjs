import { spawnSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, openSync, closeSync, unlinkSync, readdirSync, statSync } from 'node:fs';
import { randomUUID } from 'node:crypto';
import Database from 'better-sqlite3';

const check = process.argv.includes('--check');
if (process.argv.slice(2).some(arg => arg !== '--check')) throw new Error('Usage: node scripts/release.mjs [--check]');
const wrangler = 'node_modules/wrangler/bin/wrangler.js';
const adapter = 'node_modules/@opennextjs/cloudflare/dist/cli/index.js';
mkdirSync('.data/releases', { recursive: true });
const lock = '.data/releases/release.lock';
const fd = openSync(lock, 'wx');
function run(script, args = [], output) {
  console.log(`Running ${script} ${args.join(' ')}`);
  const env = { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' };
  delete env.NODE_TEST_CONTEXT;
  const result = spawnSync(process.execPath, [script, ...args], {
    stdio: output ? ['ignore', 'pipe', 'pipe'] : 'inherit', encoding: 'utf8',
    env, timeout: 900000,
  });
  if (output) writeFileSync(output, (result.stdout ?? '') + (result.stderr ?? ''));
  if (result.error || result.status !== 0) throw new Error(`Stopped: ${script} failed${output ? `; details: ${output}` : ''}`, { cause: result.error });
}
try {
  run('scripts/check-cloudflare-config.mjs');
  const id = randomUUID();
  writeFileSync('lib/release-info.json', JSON.stringify({ id }) + '\n');
  run(adapter, ['build']);
  run('--test', ['--test-concurrency=1', ...readdirSync('tests').filter(f => f.endsWith('.test.mjs')).map(f => `tests/${f}`)]);
  if (check) {
    console.log('Release check passed. No production commands executed.');
  } else {
    const directory = `.data/releases/${new Date().toISOString().replace(/[:.]/g, '-')}`;
    mkdirSync(directory);
    run(wrangler, ['d1', 'export', 'DB', '--remote', `--output=${directory}/database.sql`], `${directory}/backup.log`);
    if (statSync(`${directory}/database.sql`).size < 100) throw new Error('Backup is empty; deployment stopped');
    const restored = new Database(':memory:');
    try {
      restored.exec(readFileSync(`${directory}/database.sql`, 'utf8'));
      restored.prepare('SELECT id FROM players LIMIT 0').all();
      restored.prepare('SELECT id FROM events LIMIT 0').all();
      if (restored.pragma('quick_check', { simple: true }) !== 'ok') throw new Error('Backup integrity check failed');
    } finally { restored.close(); }
    run(wrangler, ['d1', 'migrations', 'apply', 'DB', '--remote']);
    run(adapter, ['deploy']);
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
    writeFileSync(`${directory}/receipt.json`, JSON.stringify({ id, verifiedAt: new Date().toISOString() }, null, 2));
    console.log(`Published and verified: https://aabenbaneaften.dk (backup: ${directory}/database.sql)`);
  }
} finally { closeSync(fd); unlinkSync(lock); }
