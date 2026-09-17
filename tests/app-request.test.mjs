import assert from 'node:assert/strict';
import test from 'node:test';
import { appRequest, requireLoginSession } from '../lib/app-request.ts';

test('login sends credentials and verifies the subsequent session', async (t) => {
  const calls = [];
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    calls.push({ url, options });
    return Response.json(options.method ? { ok: true } : { authenticated: true });
  });
  await appRequest({ action: 'login', memberNo: '123', pin: '1234' });
  requireLoginSession(await appRequest());
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(JSON.parse(calls[0].options.body).memberNo, '123');
  for (const { url, options } of calls) {
    assert.equal(url, '/api/app');
    assert.equal(options.credentials, 'same-origin');
    assert.equal(options.cache, 'no-store');
  }
  assert.throws(() => requireLoginSession({ authenticated: false }), /cookies/);
});

test('server errors and non-JSON responses produce useful messages', async (t) => {
  const fetch = t.mock.method(globalThis, 'fetch', async () => Response.json({ error: 'Forkert kode' }, { status: 401 }));
  await assert.rejects(appRequest({ action: 'login' }), /Forkert kode/);
  fetch.mock.mockImplementation(async () => new Response('<html>Bad gateway</html>', { status: 502, headers: { 'cf-ray': 'test-ray-CPH' } }));
  await assert.rejects(appRequest(), /uventet svar \(HTTP 502\).*Reference: test-ray-CPH/);
  assert.equal(fetch.mock.callCount(), 2, 'failed requests are not replayed automatically');
});

test('requests time out instead of leaving login pending', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] });
  t.mock.method(globalThis, 'fetch', async (_url, { signal }) => new Promise((_resolve, reject) => {
    signal.addEventListener('abort', () => reject(signal.reason), { once: true });
  }));
  const result = assert.rejects(appRequest(), /ikke i tide/);
  t.mock.timers.tick(20000);
  await result;
});
