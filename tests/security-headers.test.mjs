import test from 'node:test';
import assert from 'node:assert/strict';
import {contentSecurityPolicy,securityHeaders} from '../lib/security-headers.ts';
import {sameOrigin} from '../lib/privacy-request.ts';

test('production CSP permits nonce scripts but blocks inline handlers, framing and objects',()=>{
  const policy=contentSecurityPolicy('test-nonce');
  const scripts=policy.split('; ').find(d=>d.startsWith('script-src '));
  assert.match(scripts,/'nonce-test-nonce'/);
  assert.doesNotMatch(scripts,/unsafe-inline|unsafe-eval/);
  for(const directive of ["frame-ancestors 'none'","object-src 'none'","base-uri 'none'","script-src-attr 'none'","connect-src 'self'"])assert.ok(policy.includes(directive));
  assert.match(contentSecurityPolicy('dev',true),/unsafe-eval/);
  assert.equal(securityHeaders.find(h=>h.key==='X-Content-Type-Options').value,'nosniff');
});

test('JSON mutation guard rejects foreign origins, sibling sites and disguised content types',()=>{
  const allowed=headers=>sameOrigin(new Request('https://example.test/api/app',{method:'POST',headers}));
  assert.equal(allowed({'content-type':'application/json; charset=utf-8',origin:'https://example.test','sec-fetch-site':'same-origin'}),true);
  assert.equal(allowed({'content-type':'application/json'}),true,'non-browser requests remain compatible; authentication still applies');
  for(const headers of [
    {origin:'https://evil.test'}, {origin:'null'}, {origin:'http://example.test'},
    {'sec-fetch-site':'cross-site'}, {'sec-fetch-site':'same-site'},
    {'content-type':'text/plain'}, {'content-type':'application/jsonp'}, {'content-type':'application/x-www-form-urlencoded'},
  ])assert.equal(allowed({'content-type':'application/json',...headers}),false);
});
