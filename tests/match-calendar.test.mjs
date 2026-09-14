import test from 'node:test';
import assert from 'node:assert/strict';
import { createMatchCalendar } from '../lib/match-calendar.ts';

const match = { date: '2026-09-18', startTime: '18:30', court: 3,
  players: ['Søren Jensen', 'Anne-Marie Hansen', 'Bo Nielsen', 'Ida Larsen'] };

test('Friday match uses first names, indoor court and Copenhagen summer time', () => {
  const ics = createMatchCalendar(match);
  assert.ok(ics.includes('SUMMARY:Søren & Anne-Marie vs Bo & Ida\r\n'));
  assert.ok(ics.includes('LOCATION:Indendørs Bane #3\r\n'));
  assert.ok(ics.includes('DTSTART:20260918T163000Z\r\n'));
  assert.ok(ics.includes('DTEND:20260918T173000Z\r\n'));
  assert.ok(ics.endsWith('END:VCALENDAR\r\n'));
});

test('Wednesday import uses outdoor court and the actual end time, including dotted times', () => {
  const ics = createMatchCalendar({ ...match, date: '2026-09-16', startTime: '18.30', endTime: '20.00', court: 'Bane 4' });
  assert.ok(ics.includes('LOCATION:Udendørs Bane #4\r\n'));
  assert.ok(ics.includes('DTSTART:20260916T163000Z\r\n'));
  assert.ok(ics.includes('DTEND:20260916T180000Z\r\n'));
});

test('winter time remains Danish time regardless of the device time zone', () => {
  const ics = createMatchCalendar({ ...match, date: '2026-12-18' });
  assert.ok(ics.includes('DTSTART:20261218T173000Z\r\n'));
  assert.ok(ics.includes('DTEND:20261218T183000Z\r\n'));
});

test('stored first names preserve multiple given names and escape calendar text', () => {
  const ics = createMatchCalendar({ ...match, players: [
    { name: 'Anne Marie Jensen', firstName: 'Anne Marie' }, 'Bo, Nielsen', 'Ida; Larsen', 'Søren Jensen',
  ] });
  assert.ok(ics.includes('SUMMARY:Anne Marie & Bo\\, vs Ida\\; & Søren\r\n'));
});

test('calendar lines respect UTF-8 folding and the same match has a stable UID', () => {
  const longMatch = { ...match, players: ['Ø'.repeat(100), ...match.players.slice(1)] };
  const ics = createMatchCalendar(longMatch);
  for (const line of ics.split('\r\n')) assert.ok(Buffer.byteLength(line) <= 75);
  assert.ok(ics.replace(/\r\n /g, '').includes(`SUMMARY:${'Ø'.repeat(100)} & Anne-Marie vs Bo & Ida`));
  assert.equal(ics.match(/UID:.*/)[0], createMatchCalendar(longMatch, new Date('2026-01-01')).match(/UID:.*/)[0]);
});
