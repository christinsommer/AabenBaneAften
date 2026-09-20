import test from 'node:test';
import assert from 'node:assert/strict';
import {parseRegistrationDefaults,initialRegistrationDefaults} from '../lib/registration-defaults.ts';
import {calendarEvent} from '../lib/calendar.ts';

test('registration defaults validate day limits and chronological order',()=>{
  assert.deepEqual(parseRegistrationDefaults(initialRegistrationDefaults),initialRegistrationDefaults);
  for(const days of [0,7,1.5,'2',null]) assert.throws(()=>parseRegistrationDefaults({...initialRegistrationDefaults,openDays:days}));
  assert.throws(()=>parseRegistrationDefaults({...initialRegistrationDefaults,closeDays:3}));
  for(const time of ['24:00','12:60','6:00','']) assert.throws(()=>parseRegistrationDefaults({...initialRegistrationDefaults,openTime:time}));
  assert.throws(()=>parseRegistrationDefaults({openDays:1,closeDays:1,openTime:'12:30',closeTime:'12:30'}));
  assert.doesNotThrow(()=>parseRegistrationDefaults({openDays:1,closeDays:1,openTime:'12:30',closeTime:'12:31'}));
});

test('new rounds use configured minute precision and Copenhagen seasonal offsets',()=>{
  const defaults={openDays:3,openTime:'07:15',closeDays:1,closeTime:'13:45'};
  const summer=calendarEvent('2026-09-25',defaults),winter=calendarEvent('2026-12-25',defaults);
  assert.equal(summer.registrationOpensAt,'2026-09-22T05:15:00.000Z');
  assert.equal(summer.registrationClosesAt,'2026-09-24T11:45:00.000Z');
  assert.equal(winter.registrationOpensAt,'2026-12-22T06:15:00.000Z');
  assert.equal(winter.registrationClosesAt,'2026-12-24T12:45:00.000Z');
  for(const date of ['2026-03-30','2026-10-26']) assert.throws(()=>calendarEvent(date,{openDays:1,closeDays:1,openTime:'02:30',closeTime:'12:00'}));
});
