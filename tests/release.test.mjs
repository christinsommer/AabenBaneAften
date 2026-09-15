import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawn } from 'node:child_process';

test('release check never touches production; test and backup failures stop deployment', { timeout: 60000 }, async () => {
  const script = resolve('scripts/release.mjs');
  for (const scenario of ['check', 'test-fails', 'backup-fails']) {
    const directory = mkdtempSync(join(tmpdir(), 'aabenbane-release-'));
    const put = (path, contents) => { const full = join(directory, path); mkdirSync(resolve(full, '..'), { recursive: true }); writeFileSync(full, contents); };
    put('scripts/check-cloudflare-config.mjs', '');
    put('scripts/optimizer-service.mjs', '');
    put('lib/release-info.json', '{}');
    put('tests/example.test.mjs', scenario === 'test-fails' ? 'throw new Error("intentional failure")' : '');
    put('node_modules/@opennextjs/cloudflare/dist/cli/index.js', "require('node:fs').appendFileSync('calls.txt',process.argv[2]+'\\n')");
    put('node_modules/wrangler/bin/wrangler.js', "require('node:fs').appendFileSync('calls.txt',process.argv.slice(2).join(' ')+'\\n');process.exit(1)");
    try {
      const result = await new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [script, ...(scenario === 'check' ? ['--check'] : [])], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
        let output = '';
        child.stdout.on('data', chunk => output += chunk);
        child.stderr.on('data', chunk => output += chunk);
        child.on('error', reject);
        child.on('close', code => resolve({ code, output }));
      });
      const calls = readFileSync(join(directory, 'calls.txt'), 'utf8');
      assert.equal(result.code === 0, scenario === 'check', result.output);
      assert.equal(calls.includes('d1 export'), scenario === 'backup-fails');
      assert.equal(calls.includes('migrations'), false);
      assert.equal(calls.includes('deploy'), false);
      assert.equal(existsSync(join(directory, '.data/releases/release.lock')), false);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  }
});
