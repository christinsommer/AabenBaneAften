import assert from 'node:assert/strict';
import test from 'node:test';
import {registrationIsOpen, registrationSchedule, registrationDateParts} from '../lib/registration.ts';

test('custom registration hours use Copenhagen time in summer and winter',()=>{
  for(const [date,utcHour] of [['2026-09-16','07'],['2026-12-16','08']]) {
    const window=registrationSchedule({opensDate:date,opensHour:'09',closesDate:date,closesHour:'15'});
    assert.equal(window.registrationOpensAt,`${date}T${utcHour}:00:00.000Z`);
    assert.deepEqual(registrationDateParts(window.registrationOpensAt),{date,hour:'09'});
    const event={...window,registrationOverride:'auto',status:'draft'};
    assert.equal(registrationIsOpen(event,Date.parse(window.registrationOpensAt)-1),false);
    assert.equal(registrationIsOpen(event,Date.parse(window.registrationOpensAt)),true);
    assert.equal(registrationIsOpen(event,Date.parse(window.registrationClosesAt)+1),false);
  }
});

test('invalid dates, partial hours, reversed windows and DST ambiguity are rejected',()=>{
  const input={opensDate:'2026-09-16',opensHour:'09',closesDate:'2026-09-16',closesHour:'15'};
  for(const change of [{opensDate:'2026-02-30'},{opensHour:'09:30'},{opensHour:'24'},{closesHour:'09'},{closesDate:'2026-09-15'},{opensDate:'2026-03-29',opensHour:'02'},{opensDate:'2026-10-25',opensHour:'02'}]) assert.throws(()=>registrationSchedule({...input,...change}));
});

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
