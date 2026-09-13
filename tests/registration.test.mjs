import assert from 'node:assert/strict';
import test from 'node:test';
import {registrationIsOpen} from '../lib/registration.ts';

test('registration overrides take precedence over dates, cancelled rounds stay closed',()=>{
  const round={registrationOverride:'auto',registrationOpensAt:'2026-09-09T10:00:00Z',registrationClosesAt:'2026-09-10T10:00:00Z',status:'draft'};
  const during=Date.parse('2026-09-09T15:00:00Z');
  const after=Date.parse('2026-09-12T15:00:00Z');
  assert.equal(registrationIsOpen(round,during),true);
  assert.equal(registrationIsOpen(round,after),false);
  assert.equal(registrationIsOpen({...round,registrationOverride:'open'},after),true);
  assert.equal(registrationIsOpen({...round,registrationOverride:'closed'},during),false);
  assert.equal(registrationIsOpen({...round,registrationOverride:'open',status:'cancelled'},during),false);
});
