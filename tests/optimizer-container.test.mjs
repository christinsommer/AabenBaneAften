import assert from 'node:assert/strict';
import test from 'node:test';
import {handleRequest} from '../optimizer-cloudflare/handler.js';

test('container only starts for authenticated solve and health requests', async () => {
  const key = 'a'.repeat(64);
  let starts = 0;
  const env = {OPTIMIZER_API_KEY:key, OPTIMIZER:{getByName(name) {
    assert.equal(name,'main'); starts++;
    return {fetch: async request => Response.json({path:new URL(request.url).pathname,body:request.method==='POST'?await request.json():null})};
  }}};
  assert.equal((await handleRequest(new Request('https://test/health'),env)).status,401);
  assert.equal((await handleRequest(new Request('https://test/solve',{method:'POST',headers:{authorization:'Bearer wrong'}}),env)).status,401);
  assert.equal((await handleRequest(new Request('https://test/unknown'),env)).status,404);
  assert.equal((await handleRequest(new Request('https://test/health'),{...env,OPTIMIZER_API_KEY:''})).status,503);
  assert.equal(starts,0);
  const response = await handleRequest(new Request('https://test/solve',{method:'POST',headers:{authorization:`Bearer ${key}`},body:JSON.stringify({players:[]})}),env);
  assert.deepEqual(await response.json(),{path:'/solve',body:{players:[]}});
  assert.equal(starts,1);
});
