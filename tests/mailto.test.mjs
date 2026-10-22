import test from 'node:test';
import assert from 'node:assert/strict';
import {mailtoHref,bccMailtoHref} from '../lib/mailto.ts';

test('all member email addresses go only in BCC, deduplicated without blank addresses',()=>{
  const url=new URL(bccMailtoHref([' Anne@example.dk ','anne@example.dk','bo+tennis@example.dk','',null,undefined]));
  assert.equal(url.protocol,'mailto:');
  assert.equal(url.pathname,'');
  assert.equal(url.searchParams.get('bcc'),'anne@example.dk,bo+tennis@example.dk');
  assert.equal(url.searchParams.has('to'),false);
  assert.equal(url.searchParams.has('cc'),false);
  assert.equal(bccMailtoHref(['',null]),null);
});

test('email contact links preserve the recipient separator and escape URI delimiters',()=>{
  assert.equal(mailtoHref(' anne@example.dk '),'mailto:anne@example.dk');
  for(const email of ['anne+tennis@example.dk','anne?test@example.dk','anne#test@example.dk']) {
    const url=new URL(mailtoHref(email));
    assert.equal(url.protocol,'mailto:');
    assert.equal(decodeURIComponent(url.pathname),email);
    assert.equal(url.search,'');
    assert.equal(url.hash,'');
  }
});
