import assert from 'node:assert/strict';
import test from 'node:test';
import {calendarEvent, copenhagenDate, fridayDates, validDate} from '../lib/calendar.ts';

test('Calendar includes every Friday through April and uses Danish deadlines', () => {
  const dates=fridayDates('2026-09-11','2027-04-30');
  assert.equal(dates.length,34);
  assert.equal(dates.at(-1),'2027-04-30');
  assert.ok(dates.includes('2026-10-02'));
  assert.ok(dates.includes('2027-01-01'));
  assert.equal(validDate('2027-02-29'),false);
  assert.equal(validDate('2028-02-29'),true);
  assert.equal(validDate('2027-2-01'),false);
  assert.equal(calendarEvent('2026-09-18').registrationOpensAt,'2026-09-16T10:00:00.000Z');
  assert.equal(calendarEvent('2027-01-01').registrationClosesAt,'2026-12-31T11:00:00.000Z');
  assert.equal(copenhagenDate(new Date('2026-09-17T22:30:00Z')),'2026-09-18');
});
