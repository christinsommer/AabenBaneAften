import assert from 'node:assert/strict';
import test from 'node:test';
import {firstMatchInstant, waitlistIsOpen, registrationIsOpen, registrationSchedule, registrationDateParts} from '../lib/registration.ts';

test('late waitlist requires passed deadline, closed registration and a future first match',()=>{
  const event={registrationOverride:'auto',registrationOpensAt:'2026-09-16T10:00:00Z',registrationClosesAt:'2026-09-17T10:00:00Z',status:'draft'};
  const first=firstMatchInstant('2026-09-18',['19:00','18:00','18:30']);
  assert.equal(first,'2026-09-18T16:00:00.000Z');
  assert.equal(firstMatchInstant('2026-12-18',['18:30']),'2026-12-18T17:30:00.000Z');
  const deadline=Date.parse(event.registrationClosesAt), start=Date.parse(first);
  for (const status of ['draft','published']) {
    assert.equal(waitlistIsOpen({...event,status},first,deadline),false);
    assert.equal(waitlistIsOpen({...event,status},first,deadline+1),true);
    assert.equal(waitlistIsOpen({...event,status},first,start-1),true);
    assert.equal(waitlistIsOpen({...event,status},first,start),false);
    assert.equal(waitlistIsOpen({...event,status},first,start+1),false);
  }
  assert.equal(waitlistIsOpen({...event,registrationOverride:'closed'},first,deadline-1),false);
  assert.equal(waitlistIsOpen({...event,registrationOverride:'closed'},first,deadline+1),true);
  assert.equal(waitlistIsOpen({...event,registrationOverride:'open'},first,deadline+1),false);
  assert.equal(waitlistIsOpen({...event,status:'cancelled'},first,deadline+1),false);
});

test('custom registration hours use Copenhagen time in summer and winter',()=>{
  const precise=registrationSchedule({opensDate:'2026-09-16',opensTime:'09:15',closesDate:'2026-09-17',closesTime:'12:45'});
  assert.equal(precise.registrationOpensAt,'2026-09-16T07:15:00.000Z');
  assert.equal(precise.registrationClosesAt,'2026-09-17T10:45:00.000Z');
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
