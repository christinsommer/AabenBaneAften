import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, cpSync, readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawn } from 'node:child_process';
import Database from 'better-sqlite3';
import { getPlatformProxy } from 'wrangler';

test('local setup preserves SQLite data, is repeatable and refuses remote bindings', { timeout: 120000 }, async () => {
  const directory = mkdtempSync(join(tmpdir(), 'aabenbane-setup-'));
  const script = resolve('scripts/setup-local-d1.mjs');
  const config = JSON.parse(readFileSync('wrangler.jsonc', 'utf8'));
  const configPath = join(directory, 'wrangler.jsonc');
  writeFileSync(configPath, JSON.stringify({ d1_databases: config.d1_databases, compatibility_date: config.compatibility_date }));
  cpSync('drizzle', join(directory, 'drizzle'), { recursive: true });
  mkdirSync(join(directory, '.data'));
  const source = new Database(join(directory, '.data/app.db'));
  source.exec("CREATE TABLE players(id INTEGER PRIMARY KEY,member_no TEXT,name TEXT,email TEXT,gender TEXT,self_level TEXT,pin_hash TEXT); INSERT INTO players VALUES(42,'preserved','Christin Hytoft Sommer','test@example.com','K','B','hash'); CREATE TABLE events(id INTEGER PRIMARY KEY,date TEXT,registration_opens_at TEXT,registration_closes_at TEXT,imported_kampplan TEXT); INSERT INTO events VALUES(7,'2026-09-11','2026-09-01','2026-09-12','[{\"Bane\":1}]');");
  source.close();
  const run = () => new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [script], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', data => output += data);
    child.stderr.on('data', data => output += data);
    child.on('error', reject);
    child.on('close', code => resolve({ code, output }));
  });
  let proxy;
  try {
    for (let i = 0; i < 2; i++) { const result = await run(); assert.equal(result.code, 0, result.output); }
    proxy = await getPlatformProxy({ configPath, persist: { path: join(directory, '.wrangler/local-dev/v3') } });
    const player = await proxy.env.DB.prepare('SELECT * FROM players').first();
    assert.equal(player.id, 42);
    assert.equal(player.member_no, 'preserved');
    assert.equal(player.pin_hash, 'hash');
    const events = (await proxy.env.DB.prepare('SELECT * FROM events').all()).results;
    assert.equal(events.length, 1);
    assert.equal(events[0].id, 7);
    assert.equal(events[0].imported_kampplan, '[{"Bane":1}]');
    await proxy.dispose(); proxy = undefined;
    config.d1_databases[0].remote = true;
    writeFileSync(configPath, JSON.stringify(config));
    const rejected = await run();
    assert.notEqual(rejected.code, 0);
    assert.match(rejected.output, /refuses remote bindings/);
  } finally { if (proxy) await proxy.dispose(); rmSync(directory, { recursive: true, force: true }); }
});
