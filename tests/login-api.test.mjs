import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { build } from 'esbuild';
import { getPlatformProxy } from 'wrangler';
import { migrationStatements } from '../scripts/migration-statements.mjs';
import { hashPin } from '../lib/credentials.ts';
import { appRequest, requireLoginSession } from '../lib/app-request.ts';

test('client helper logs in through real API and D1 with leading-zero PIN and session round trip', { timeout: 120000 }, async () => {
  const directory = mkdtempSync(join(process.cwd(), '.login-test-'));
  const originalFetch = globalThis.fetch;
  let proxy;
  try {
    proxy = await getPlatformProxy({ configPath: 'wrangler.jsonc', persist: { path: join(directory, 'db') } });
    const db = proxy.env.DB;
    for (const file of readdirSync('drizzle').filter(f => f.endsWith('.sql')).sort()) {
      await db.batch(migrationStatements(readFileSync(join('drizzle', file), 'utf8')).map(s => db.prepare(s)));
    }
    await db.prepare('INSERT INTO players(member_no,name,email,gender,self_level,pin_hash) VALUES(?,?,?,?,?,?)')
      .bind('login-test', 'Login Test', 'test@example.com', 'K', 'B', await hashPin('0123')).run();
    const jar = new Map();
    let cookieOptions;
    globalThis.__loginTest = {
      env: { DB: db },
      cookies: {
        get: name => jar.has(name) ? { value: jar.get(name) } : undefined,
        set: (name, value, options) => { jar.set(name, value); cookieOptions = options; },
        delete: name => jar.delete(name),
      },
    };
    const outfile = join(directory, 'route.mjs');
    await build({ entryPoints: ['app/api/app/route.ts'], outfile, bundle: true, platform: 'node', format: 'esm', packages: 'external', plugins: [{
      name: 'test-request-context', setup(builder) {
        builder.onResolve({ filter: /^next\/server$/ }, () => ({ path: 'next/server.js', external: true }));
        builder.onResolve({ filter: /^(next\/headers|@opennextjs\/cloudflare)$/ }, args => ({ path: args.path, namespace: 'test' }));
        builder.onLoad({ filter: /.*/, namespace: 'test' }, args => ({ contents: args.path === 'next/headers'
          ? 'export const cookies=async()=>globalThis.__loginTest.cookies;'
          : 'export const getCloudflareContext=()=>({env:globalThis.__loginTest.env});' }));
      },
    }] });
    const { GET, POST } = await import(pathToFileURL(outfile).href);
    globalThis.fetch = async (url, options = {}) => {
      if (url !== '/api/app') return originalFetch(url, options);
      return options.method === 'POST' ? POST(new Request('https://example.test/api/app', options)) : GET();
    };
    assert.equal((await appRequest()).authenticated, false);
    await appRequest({ action: 'login', memberNo: ' login-test ', pin: '0123' });
    const state = await appRequest();
    requireLoginSession(state);
    assert.equal(state.user.memberNo, 'login-test');
    const schedule = {action:'set_registration_schedule',eventId:state.event.id,opensDate:'2026-09-16',opensHour:'09',closesDate:'2026-09-17',closesHour:'18'};
    await assert.rejects(appRequest(schedule), /Kun administratorer/);
    await db.prepare("UPDATE players SET role='admin' WHERE member_no='login-test'").run();
    await assert.rejects(appRequest({...schedule,closesDate:'2026-09-15'}), /efter start/);
    await assert.rejects(appRequest({...schedule,eventId:-1}), /Spillerunden er ændret/);
    await appRequest(schedule);
    const updated = await appRequest();
    assert.equal(updated.event.registrationOpensAt,'2026-09-16T07:00:00.000Z');
    assert.equal(updated.event.registrationClosesAt,'2026-09-17T16:00:00.000Z');
    assert.equal(updated.event.registrationOverride,state.event.registrationOverride);
    assert.equal(cookieOptions.httpOnly, true);
    assert.equal(cookieOptions.sameSite, 'lax');
    assert.equal((await db.prepare('SELECT count(*) AS n FROM sessions').first()).n, 1);
    jar.clear();
    assert.throws(() => requireLoginSession({ authenticated: false }), /Login kunne ikke bevares/);
    assert.equal((await appRequest()).authenticated, false);
    await assert.rejects(appRequest({ action: 'login', memberNo: 'login-test', pin: '9999' }), /Medlemsnummer eller kode er forkert/);
    await assert.rejects(appRequest({ action: 'login', memberNo: 'missing', pin: '0123' }), /Medlemsnummer eller kode er forkert/);
    assert.equal(jar.size, 0);
  } finally {
    globalThis.fetch = originalFetch;
    delete globalThis.__loginTest;
    await proxy?.dispose();
    rmSync(directory, { recursive: true, force: true });
  }
});
