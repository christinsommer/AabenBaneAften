import test from 'node:test';
import assert from 'node:assert/strict';
import {planEmail} from '../lib/plan-email.ts';
import {planLink} from '../lib/plan-link.ts';

test('plan email contains a dated deep link with the own-matches filter in text and HTML',()=>{
  const mail=planEmail('member@example.dk','2026-09-25');
  assert.equal(mail.to,'member@example.dk');
  assert.match(mail.subject,/25\. september 2026/);
  const link=mail.text.match(/https:\/\/\S+/)[0];
  assert.deepEqual(planLink(new URL(link).search),{open:true,onlyMine:true,date:'2026-09-25'});
  assert.ok(mail.html.includes('href="https://aabenbaneaften.dk/?view=plan&amp;mine=1&amp;date=2026-09-25"'));
  assert.match(mail.text,/venteliste/);
  assert.deepEqual(planLink(''),{open:false,onlyMine:false,date:null});
});
