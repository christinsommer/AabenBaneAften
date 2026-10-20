import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn, spawnSync } from 'node:child_process';

test('existing release locks block all steps and are preserved with an actionable message', () => {
  for (const contents of ['', JSON.stringify({pid: process.pid, startedAt: '2026-10-19T12:00:00Z'})]) {
    const directory = mkdtempSync(join(tmpdir(), 'aabenbane-release-lock-'));
    try {
      mkdirSync(join(directory, '.data/releases'), {recursive: true});
      const lock = join(directory, '.data/releases/release.lock');
      writeFileSync(lock, contents);
      const result = spawnSync(process.execPath, [resolve('scripts/release.mjs'), '--check'], {cwd: directory, encoding: 'utf8', timeout: 10000});
      assert.equal(result.status, 1);
      assert.match(result.stderr, /Check for an active deployment/);
      assert.match(result.stderr, /No release steps were started/);
      assert.doesNotMatch(result.stderr, /EEXIST/);
      assert.equal(readFileSync(lock, 'utf8'), contents);
      assert.equal(existsSync(join(directory, 'lib/release-info.json')), false);
    } finally { rmSync(directory, {recursive: true, force: true}); }
  }
});

test('release check never touches production; test, MFA, configuration and backup failures stop both deployments', { timeout: 60000 }, async () => {
  const script = resolve('scripts/release.mjs');
  for (const scenario of ['check', 'test-fails', 'mfa-fails', 'email-fails', 'config-fails', 'backup-fails']) {
    const directory = mkdtempSync(join(tmpdir(), 'aabenbane-release-'));
    const put = (path, contents) => { const full = join(directory, path); mkdirSync(resolve(full, '..'), { recursive: true }); writeFileSync(full, contents); };
    put('scripts/check-cloudflare-config.mjs', '');
    put('scripts/check-email-config.mjs', `import {appendFileSync} from 'node:fs'; appendFileSync('calls.txt','email-check\\n'); process.exit(${scenario === 'email-fails' ? 1 : 0});`);
    put('scripts/optimizer-service.mjs', '');
    put('scripts/setup-mfa.mjs', `import {appendFileSync} from 'node:fs'; appendFileSync('calls.txt','mfa '+process.argv[2]+'\\n'); process.exit(${scenario === 'mfa-fails' ? 1 : 0});`);
    put('scripts/deploy-superadmin.mjs', scenario === 'config-fails' ? 'process.exit(1)' : '');
    put('scripts/optimizer-cloudflare.mjs', "import {appendFileSync} from 'node:fs'; appendFileSync('calls.txt','optimizer '+process.argv[2]+'\\n')");
    put('lib/release-info.json', '{}');
    put('tests/example.test.mjs', scenario === 'test-fails' ? 'throw new Error("intentional failure")' : '');
    put('node_modules/@opennextjs/cloudflare/dist/cli/index.js', "require('node:fs').appendFileSync('calls.txt',process.argv[2]+'\\n')");
    put('node_modules/wrangler/bin/wrangler.js', "require('node:fs').appendFileSync('calls.txt',process.argv.slice(2).join(' ')+'\\n');process.exit(1)");
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...(scenario === 'check' ? ['--check'] : ['--with-optimizer'])], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => output += chunk);
        child.stderr.on('data', chunk => output += chunk);
        child.on('error', reject);
        child.on('close', code => resolve({ code, output }));
      });
      const calls = readFileSync(join(directory, 'calls.txt'), 'utf8');
      assert.equal(result.code === 0, scenario === 'check', result.output);
      assert.equal(calls.includes('mfa --check-remote'), scenario !== 'check', `${scenario}\n${result.output}`);
      assert.equal(calls.includes('email-check'), !['check', 'mfa-fails'].includes(scenario), `${scenario}\n${result.output}`);
      assert.equal(calls.includes('build'), !['mfa-fails', 'email-fails', 'config-fails'].includes(scenario), `${scenario}\n${result.output}`);
      assert.equal(calls.includes('d1 export'), scenario === 'backup-fails', `${scenario}\n${result.output}`);
      const failedStep = {'test-fails':'--test', 'mfa-fails':'scripts/setup-mfa.mjs', 'email-fails':'scripts/check-email-config.mjs', 'config-fails':'scripts/deploy-superadmin.mjs', 'backup-fails':'node_modules/wrangler/bin/wrangler.js'}[scenario];
      if (failedStep) assert.ok(result.output.includes(`Stopped: ${failedStep}`), `${scenario}\n${result.output}`);
      assert.equal(calls.includes('migrations'), false);
      assert.equal(calls.includes('deploy'), false);
      assert.equal(calls.includes('optimizer'), false);
      assert.equal(existsSync(join(directory, '.data/releases/release.lock')), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
